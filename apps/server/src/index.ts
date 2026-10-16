import "./logging";

import {WebSocketServer} from "ws";
import minimist from "minimist";

import {createServer} from "http";

import type { MessageHandler } from "./types";

// ensure data init scripts run
import {write_ws_url_for_editor} from "./data";

import {register_notifiers} from "./notifiers";

import {Client, connected_clients, WireMessage} from "./clients";
import {NodeWebSocketTransport} from "./transport";
import {start_server_session} from "@pi-tray/secure-channel";
import {handle_asset_request} from "./assets";
import {live_client_connected, live_client_disconnected} from "./live/runner";
import {apply_arg_overrides, SERVER_CONFIG_FILE} from "@pi-tray/server-config";
import {load_server_config} from "./config";

import * as _handlers from "./handlers";
import {create_address_filter} from "./network_filter";
const handlers: { [action: string]: MessageHandler | undefined } = _handlers;
Object.freeze(handlers);

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

// assets are served over plain http on the same port, so the websocket only has to carry references to them
const http_server = createServer(handle_asset_request);
const ws_server = new WebSocketServer({ server: http_server });

// decrypts in order from one client, dispatching each message to its handler
const dispatch = async (client: Client, data: WireMessage) => {
    if (typeof data?.action !== "string") {
        console.warn("Ignoring a message with no action");
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

ws_server.on("connection", async ws => {
    console.log("Client connected, starting secure handshake");

    ws.on("error", (error) => {
        console.warn("Client socket error:", error.message);
    });

    let session;
    try {
        session = await start_server_session<WireMessage>(new NodeWebSocketTransport(ws));
    } catch (error) {
        console.warn("Handshake failed, dropping connection:", error instanceof Error ? error.message : error);
        return;
    }

    const client = new Client(session);
    connected_clients.add(client);

    const unregister_notifiers = register_notifiers(client);
    live_client_connected();

    ws.on("close", () => {
        connected_clients.delete(client);
        unregister_notifiers();
        live_client_disconnected();
    });

    // welcome message
    client.send({action: "hello", payload: {motd: "Served fresh!"}});

    // pull decrypted messages until the channel closes or a frame fails to authenticate
    try {
        for (;;) {
            await dispatch(client, await session.receive());
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
    console.log(`Server is listening on ws://${host}:${port}`);

    let effective_host = host;
    if (effective_host === "0.0.0.0" || effective_host === "::") {
        effective_host = "localhost";
    }

    write_ws_url_for_editor(effective_host, port);
});

http_server.listen(port, host);
