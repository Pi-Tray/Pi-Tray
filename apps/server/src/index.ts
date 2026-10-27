import "./logging";

import {WebSocketServer} from "ws";
import minimist from "minimist";

import {createServer} from "http";

import type { MessageHandler } from "./types";

// ensure data init scripts run
import {write_ws_url_for_editor} from "./pages";

import {register_notifiers} from "./notifiers";

import {Client, ClientIdentity, connected_clients, WireMessage} from "./clients";
import {NodeWebSocketTransport} from "./transport";
import {CloseCode, handle_login_server, Session, start_server_session} from "@pi-tray/secure-channel";
import {get_editor_public_key, load_identities} from "./identity";
import {find_paired_key, touch_paired_device} from "./paired_devices";
import {broadcast_paired_devices, get_pairing_state, pair_unknown_device, pairing_connection_closed} from "./pairing";
import {live_client_connected, live_client_disconnected} from "./live/runner";
import {apply_arg_overrides, SERVER_CONFIG_FILE} from "@pi-tray/server-config";
import {load_server_config} from "./config";

import * as _handlers from "./handlers";
import {create_address_filter} from "./network_filter";
import {register_for_shutdown} from "./shutdown";
import {app_version} from "./version";
import {handle_http_request} from "./http";
const handlers: { [action: string]: MessageHandler | undefined } = _handlers;
Object.freeze(handlers);

// only the editor can manage pairing, a paired device can't pair or revoke others
const EDITOR_ONLY_ACTIONS = new Set([
    "get_pairing_state",
    "submit_pairing_code",
    "list_paired_devices",
    "revoke_paired_device",
    "retry_client_update",
    "reload",
    "reload_plugins"
]);

// how often to ping each client; a client that hasn't ponged by the next tick is assumed dead and dropped,
// so a device that vanishes ungracefully (power/network loss, half-open socket) stops reading as online
// within two intervals instead of lingering until the next send to it fails
const HEARTBEAT_INTERVAL_MS = 30_000;

// TODO: pass custom data directory as argument?

const config = apply_arg_overrides(load_server_config(), minimist(process.argv.slice(2)));
const {host, port} = config;

if (host === "127.0.0.1" || host === "::1" || host === "localhost") {
    console.warn(`Warning: hosting on ${host}, so only this PC can connect. Set "host" in ${SERVER_CONFIG_FILE} to reach the server from your Pi.`);
}

if (config.allowed_networks.length === 0) {
    console.warn(`Warning: allowed_networks in ${SERVER_CONFIG_FILE} is empty, so every connection will be refused.`);
} else {
    console.log(`Accepting connections from: ${config.allowed_networks.join(", ")}`);
}

console.log(`Starting WebSocket server on ws://${host}:${port}`);

const http_server = createServer(handle_http_request);
const ws_server = new WebSocketServer({ server: http_server });

register_for_shutdown(http_server, ws_server);

// decrypts in order from one client, dispatching each message to its handler
const dispatch = async (client: Client, data: WireMessage) => {
    if (typeof data?.action !== "string") {
        console.warn("Ignoring a message with no action");
        return;
    }

    if (EDITOR_ONLY_ACTIONS.has(data.action) && !client.is_editor) {
        console.warn(`A device sent the editor only action "${data.action}"`);
        client.send({action: "invalid", payload: {for: data}});
        return;
    }

    const handler = handlers[data.action];
    if (!handler) {
        console.warn(`No handler for action "${data.action}"`);
        client.send({action: "invalid", payload: {for: data}});
        return;
    }

    try {
        await handler(client, data.payload);
    } catch (error) {
        console.error(`Error handling action "${data.action}":`, error);
        client.send({action: "error", payload: {for: data}});
    }
}

// the editor logs in with its identity from the data folder, everything else has to be paired
const find_login_key = (public_key: string): string | null => {
    return public_key === get_editor_public_key() ? public_key : find_paired_key(public_key);
}

/**
 * Logs the client in, pairing it first if it's unknown and the pairing window is open.
 * @returns who the client is, or null if pairing was refused (the connection is already being closed)
 * @throws if the login or pairing fails
 */
const authenticate = async (session: Session<WireMessage>): Promise<ClientIdentity | null> => {
    let login = await handle_login_server(session, find_login_key);

    if (login.outcome === "unknown_device") {
        if (!await pair_unknown_device(session, login.public_key)) {
            return null;
        }

        // pairing trusted the key, logging in again proves this session holds it
        login = await handle_login_server(session, find_login_key);

        if (login.outcome !== "logged_in") {
            throw new Error("Device still unknown after pairing");
        }
    }

    if (login.public_key === get_editor_public_key()) {
        return {role: "editor", public_key: login.public_key};
    }

    touch_paired_device(login.public_key);
    return {role: "device", public_key: login.public_key};
}

ws_server.on("connection", async ws => {
    console.log("Client connected, starting secure handshake");

    ws.on("error", (error) => {
        console.warn("Client socket error:", error.message);
    });

    let session: Session<WireMessage>;
    try {
        session = await start_server_session<WireMessage>(new NodeWebSocketTransport(ws));
    } catch (error) {
        console.warn("Handshake failed, dropping connection:", error instanceof Error ? error.message : error);
        return;
    }

    // frees the pairing slot if the device leaves while its code is showing
    ws.on("close", () => pairing_connection_closed(session));

    let identity: ClientIdentity | null;
    try {
        identity = await authenticate(session);
    } catch (error) {
        console.warn("Login failed, dropping connection:", error instanceof Error ? error.message : error);
        session.disconnect(CloseCode.LOGIN_FAILED, "login failed");
        return;
    }

    if (!identity) {
        return;
    }

    // the socket may have closed while the device was pairing or logging in
    if (ws.readyState !== ws.OPEN) {
        return;
    }

    console.log(identity.role === "editor" ? "Editor logged in" : "Device logged in");

    // nothing below runs until the client has logged in, so handlers and notifiers never see an unauthenticated client
    const client = new Client(session, identity);
    connected_clients.add(client);

    const unregister_notifiers = register_notifiers(client);
    live_client_connected();

    // a device just came online, let the editors' devices page reflect it live
    if (client.identity.role === "device") {
        broadcast_paired_devices();
    }

    // terminate a client that misses a heartbeat; ws ping/pong are control frames, so they never reach
    // the secure channel's message stream
    let awaiting_pong = false;
    const heartbeat = setInterval(() => {
        if (awaiting_pong) {
            console.warn("Client missed heartbeat, terminating connection");
            ws.terminate(); // fires "close" below, which runs the same cleanup as a clean disconnect
            return;
        }

        awaiting_pong = true;
        ws.ping();
    }, HEARTBEAT_INTERVAL_MS);
    ws.on("pong", () => { awaiting_pong = false; });

    ws.on("close", () => {
        clearInterval(heartbeat);
        connected_clients.delete(client);
        unregister_notifiers();
        live_client_disconnected();

        // record when the device was last online and tell the editors it dropped
        if (client.identity.role === "device") {
            touch_paired_device(client.identity.public_key);
            broadcast_paired_devices();
        }
    });

    // welcome message
    client.send({action: "hello", payload: {motd: "Served fresh!"}});

    if (client.is_editor) {
        client.send({action: "pairing_state", payload: get_pairing_state()});
    }

    // pull decrypted messages until the channel closes or a frame fails to authenticate
    try {
        for (;;) {
            await dispatch(client, await session.receive_app_data());
        }
    } catch (error) {
        console.log("Client channel closed:", error instanceof Error ? error.message : error);
        ws.close();
    }
});

const is_allowed_address = create_address_filter(config.allowed_networks);

// checked on the raw connection, so blocked addresses can't reach the websocket or the asset files
http_server.on("connection", (socket) => {
    if (!is_allowed_address(socket.remoteAddress)) {
        console.warn(`Refused connection from ${socket.remoteAddress}, it isn't in allowed_networks`);
        socket.destroy();
    }
});

http_server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use, is the server already running? Change "port" in ${SERVER_CONFIG_FILE} if something else uses it.`);
    } else {
        console.error("Server error:", error);
    }

    process.exit(1);
});

http_server.on("listening", () => {
    console.log(`Pi-Tray ${app_version} server is listening on ws://${host}:${port}`);

    let effective_host = host;
    if (effective_host === "0.0.0.0" || effective_host === "::") {
        effective_host = "localhost";
    }

    write_ws_url_for_editor(effective_host, port);
});

// the server needs its identity before it can log anyone in
load_identities().then(() => {
    http_server.listen(port, host);
}).catch((error) => {
    console.error("Failed to load the server's identity:", error);
    process.exit(1);
});
