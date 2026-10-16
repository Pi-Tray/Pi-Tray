import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {ServerMessage} from "@pi-tray/types";
import {Session, start_client_session} from "@pi-tray/secure-channel";
import {BrowserWebSocketTransport} from "../util/BrowserWebSocketTransport.ts";

/**
 * A message the editor sends to the server. The channel encrypts and frames it, so callers pass
 * the object rather than a JSON string. The editor is an admin client, so this stays open-ended.
 */
export type ClientMessage = {action: string, payload?: unknown};

/**
 * The channel's lifecycle: connecting (socket opening), encrypting (socket open, running the secure
 * handshake), ready (handshake confirmed, safe to send), or closed (waiting to reconnect).
 */
export type ChannelStatus = "connecting" | "encrypting" | "ready" | "closed";

export interface Channel {
    status: ChannelStatus;

    /** The url the channel connected to, e.g. ws://localhost:8080. */
    url: string;

    /** Encrypts and sends a message. Drops it (with a log) if the channel isn't ready yet. */
    send: (message: ClientMessage) => void;

    /** Registers a handler for every server message. Returns an unsubscribe function. */
    subscribe: (handler: (message: ServerMessage) => void) => () => void;
}

const ChannelContext = createContext<Channel | null>(null);

interface WSProviderProps {
    url: string;
    children: React.ReactNode;
    max_backoff_ms?: number;
}

const DEFAULT_MAX_BACKOFF_MS = 30_000; // 30 seconds
const CONNECT_TIMEOUT_MS = 5_000; // give up on a connection attempt after 5 seconds

/**
 * Provider that keeps a secure channel to the server open, reconnecting with exponential backoff.<br>
 * It owns the single reader on the session and fans decrypted messages out to subscribers, so
 * components never touch the socket or the session directly.
 * @param url WebSocket URL to connect to
 * @param children children components that will have access to the channel context
 * @param max_backoff_ms maximum backoff time in milliseconds for reconnections (default: 30 seconds)
 * @returns the element
 */
export const WSProvider = ({url, children, max_backoff_ms = DEFAULT_MAX_BACKOFF_MS}: WSProviderProps) => {
    const [status, setStatus] = useState<ChannelStatus>("connecting");

    const session = useRef<Session<ClientMessage> | null>(null);
    const subscribers = useRef<Set<(message: ServerMessage) => void>>(new Set());

    const reconnect_attempts = useRef(0);
    const backoff_timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const force_closed = useRef(false);

    // stable across renders: components capture these once
    const send = useCallback((message: ClientMessage) => {
        if (!session.current) {
            console.error("Channel is not ready, dropping message", message);
            return;
        }

        session.current.send(message).catch((error) => console.error("Failed to send message", error));
    }, []);

    const subscribe = useCallback((handler: (message: ServerMessage) => void) => {
        subscribers.current.add(handler);
        return () => {
            subscribers.current.delete(handler);
        };
    }, []);

    // the single reader: decrypt messages in order and hand each to every subscriber
    const read_loop = useCallback(async (active_session: Session<ClientMessage>, ws: WebSocket) => {
        try {
            for (;;) {
                const message = await active_session.receive();

                if (typeof message?.action !== "string") {
                    continue;
                }

                subscribers.current.forEach((handler) => handler(message as ServerMessage));
            }
        } catch (error) {
            // closed by either side, or a frame failed to decrypt: drop the socket so onclose reconnects
            console.log("Channel reader stopped", error);
            ws.close();
        }
    }, []);

    // sets up a connection, runs the handshake, then reads until it closes, reconnecting with backoff
    const connect = useCallback(() => {
        setStatus("connecting");

        const ws = new WebSocket(url);

        const connect_timeout = setTimeout(() => {
            if (ws.readyState === WebSocket.CONNECTING) {
                console.log(`WebSocket connection timed out after ${CONNECT_TIMEOUT_MS}ms`);
                ws.close();
            }
        }, CONNECT_TIMEOUT_MS);

        ws.onopen = async () => {
            clearTimeout(connect_timeout);
            console.log(`WebSocket connection established to ${url}, starting handshake`);
            setStatus("encrypting");

            // construct the transport synchronously so it is listening before the server's hello arrives
            const transport = new BrowserWebSocketTransport(ws);

            try {
                const active_session = await start_client_session<ClientMessage>(transport);
                session.current = active_session;

                // reset backoff only once the channel is actually confirmed, not just when the socket opened
                reconnect_attempts.current = 0;
                if (backoff_timeout.current) {
                    clearTimeout(backoff_timeout.current);
                    backoff_timeout.current = null;
                }

                console.log("Secure channel ready");
                setStatus("ready");

                void read_loop(active_session, ws);
            } catch (error) {
                // start_client_session already called disconnect(); onclose will schedule the reconnect
                console.error("Secure handshake failed", error);
            }
        };

        ws.onclose = (event) => {
            clearTimeout(connect_timeout);
            console.log("WebSocket connection closed", event);

            session.current = null;
            setStatus("closed");

            if (!force_closed.current) {
                // attempt to reconnect with exponential backoff
                reconnect_attempts.current += 1;

                // cap the exponential timeout at max_backoff_ms
                const exponential_ms = 1000 * Math.pow(2, reconnect_attempts.current);
                const delay = Math.min(exponential_ms, max_backoff_ms);

                console.log(`Reconnecting in ${delay}ms...`);

                backoff_timeout.current = setTimeout(() => {
                    connect();
                }, delay);
            }
        };

        ws.onerror = (error) => {
            console.error("WebSocket error", error);
        };
    }, [url, max_backoff_ms, read_loop]);

    // create the connection and clean it up on unmount (or if the url changes)
    useEffect(() => {
        force_closed.current = false;
        connect();

        return () => {
            // mark as closed to prevent reconnection, then drop the current session's socket
            force_closed.current = true;
            session.current?.disconnect();
            session.current = null;

            if (backoff_timeout.current) {
                clearTimeout(backoff_timeout.current);
            }
        };
    }, [url]);

    // stable identity so subscribing/ready effects only re-run when the status (or url) actually changes
    const channel = useMemo<Channel>(() => ({status, url, send, subscribe}), [status, url, send, subscribe]);

    return <ChannelContext.Provider value={channel}>{children}</ChannelContext.Provider>;
};

/**
 * Access the channel. Returns null outside a {@link WSProvider} (e.g. when no server address is configured).
 */
export const useChannel = () => {
    return useContext(ChannelContext);
};

/**
 * The current channel status, re-rendering when it changes. Returns "closed" outside a provider.
 */
export const useChannelStatus = (): ChannelStatus => {
    return useChannel()?.status ?? "closed";
};

/**
 * Subscribe to server messages for as long as the component is mounted.
 * @param handler called with each message from the server
 */
export const useChannelMessage = (handler: (message: ServerMessage) => void) => {
    const channel = useChannel();

    useEffect(() => {
        if (!channel) return;
        return channel.subscribe(handler);
    }, [channel, handler]);
};

/**
 * Runs the callback whenever the channel becomes ready, including immediately if it already is.<br>
 * Use it to (re)send anything the server needs on each fresh connection.
 * @param callback called each time the channel reaches the ready state
 */
export const useChannelReady = (callback: () => void) => {
    const status = useChannelStatus();

    useEffect(() => {
        if (status === "ready") {
            callback();
        }
    }, [status, callback]);
};
