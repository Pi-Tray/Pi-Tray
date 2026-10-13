import {createContext, useCallback, useContext, useEffect, useRef, useState} from "react";

const WSContext = createContext<WebSocket | null>(null);

interface WSProviderProps {
    url: string;
    children: React.ReactNode;
    max_backoff_ms?: number;
}

const DEFAULT_MAX_BACKOFF_MS = 30_000; // 30 seconds

// TODO: port pinging to here and client

/**
 * WebSocket provider that manages a WebSocket connection and handles reconnections with exponential backoff.
 * @param url WebSocket URL to connect to
 * @param children children components that will have access to the WebSocket context
 * @param max_backoff_ms maximum backoff time in milliseconds for reconnections (default: 30 seconds)
 * @returns the element
 */
export const WSProvider = ({ url, children, max_backoff_ms = DEFAULT_MAX_BACKOFF_MS }: WSProviderProps) => {
    const [socket, setSocket] = useState<WebSocket | null>(null);

    const reconnect_attempts = useRef(0);
    // TODO: this is browser code, right? it should be a number type, why is typescript forcing us to use NodeJS.Timeout?
    const backoff_timeout = useRef<NodeJS.Timeout | null>(null);

    const force_closed = useRef(false);

    // sets up a connection with event listeners to reconnect with exponential backoff
    const connect = useCallback(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            return; // already connected
        }

        const ws = new WebSocket(url);

        ws.onopen = () => {
            console.log(`WebSocket connection established to ${url}`);

            // reset backoff on successful connection
            reconnect_attempts.current = 0;
            if (backoff_timeout.current) {
                clearTimeout(backoff_timeout.current);
                backoff_timeout.current = null;
            }
        };

        ws.onclose = (event) => {
            console.log("WebSocket connection closed", event);

            if (!force_closed.current) {
                // attempt to reconnect with exponential backoff

                reconnect_attempts.current += 1;

                // cap the exponential timeout at max_backoff_ms
                const exponential_ms = 1000 * Math.pow(2, reconnect_attempts.current);
                const delay = Math.min(exponential_ms, max_backoff_ms);

                console.log(`Reconnecting in ${delay}ms...`);

                // create timeout in a closure to ensure the scheduled URL is still the same when the timeout executes
                // TODO: is this a hack? is there a better way to do this? it seems to work fine but
                //  it does fire off one more attempt than necessary seemingly, but doesnt affect the ui state like it was before
                ((scheduled_url) => {
                    backoff_timeout.current = setTimeout(() => {
                        if (scheduled_url !== url) {
                            console.log(`Skipping reconnection to ${scheduled_url} because the URL has changed.`);
                        }

                        connect();
                    }, delay);
                })(url);
            }
        };

        ws.onerror = (error) => {
            console.error("WebSocket error", error);
        };

        setSocket(ws);
    }, [url, socket]);

    // effect to create ws connection and clean it up on unmount (or if the url changes)
    useEffect(() => {
        force_closed.current = false;
        connect();

        return () => {
            // mark as closed to prevent reconnection
            force_closed.current = true;

            if (socket) {
                socket.close();
                setSocket(null);
            }

            if (backoff_timeout.current) {
                clearTimeout(backoff_timeout.current);
            }
        };
    }, [url]);

    return <WSContext.Provider value={socket}>{children}</WSContext.Provider>;
};

/**
 * Shorthand hook to access the WebSocket context.<br>
 * This hook should be used within a component that is a child of the {@link WSProvider}.
 */
export const useWebSocket = () => {
    return useContext(WSContext);
};

/**
 * Hook to listen for changes in the WebSocket ready state.<br>
 * This hook will call the provided callback function whenever the ready state changes (open, close, or error).<br>
 * It also calls the callback immediately with the current ready state when the hook is first used.<br>
 * This hook should be used within a component that is a child of the {@link WSProvider}.
 * @param callback function to call with the new ready state
 */
export const useWebSocketReadyStateChange = (callback: (readyState: WebSocket["readyState"]) => void) => {
    const ws = useWebSocket();

    useEffect(() => {
        if (!ws) return;

        const on_change = () => {
            callback(ws.readyState);
        };

        ws.addEventListener("open", on_change);
        ws.addEventListener("close", on_change);
        ws.addEventListener("error", on_change);

        // initial call
        on_change();

        return () => {
            ws.removeEventListener("open", on_change);
            ws.removeEventListener("close", on_change);
            ws.removeEventListener("error", on_change);
        };
    }, [ws]);
}

/**
 * Hook to get the current WebSocket ready state and update when it changes.<br>
 * This hook should be used within a component that is a child of the {@link WSProvider}.
 * @returns the current WebSocket ready state
 */
export const useWebSocketReadyState = () => {
    const ws = useWebSocket();
    const [ready_state, setReadyState] = useState<WebSocket["readyState"]>(ws ? ws.readyState : WebSocket.CLOSED);

    useWebSocketReadyStateChange(setReadyState);

    return ready_state;
}
