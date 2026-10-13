import "./logging";

import WebSocket from "ws";
import minimist from "minimist";
import {createServer} from "http";

import type { MessageData, MessageHandler } from "./types";

// ensure data init scripts run
import {write_ws_url_for_editor} from "./data";

import {register_notifiers} from "./notifiers";

import * as _handlers from "./handlers";
import {connected_clients} from "./clients";
import {handle_asset_request} from "./assets";
import {live_client_connected, live_client_disconnected} from "./live/runner";
const handlers: { [action: string]: MessageHandler | undefined } = _handlers;
Object.freeze(handlers);

// TODO: set host and port from data dir
// TODO: pass custom data directory as argument

const args = minimist(process.argv.slice(2));
const port = args.port || 8080;
const host = args.host || "127.0.0.1";

if (host === "127.0.0.1" || host === "localhost") {
    console.warn("Warning: Using localhost. Server will not be accessible from other devices on network. You should specify a --host= argument to choose an interface to host on.");
}

if (host === "0.0.0.0") {
    console.warn("Warning: Using 0.0.0.0. Server will be hosted on all interfaces! Be careful with this, as it will allow anyone on the network to connect to your server. Do NOT forward the assigned port.");
}

console.log(`Starting WebSocket server on ws://${host}:${port}`);

// assets are served over plain http on the same port, so the websocket only has to carry references to them
const http_server = createServer(handle_asset_request);
const ws_server = new WebSocket.Server({ server: http_server });

ws_server.on("connection", ws => {
    console.log("Client connected");

    connected_clients.add(ws);

    const unregister_notifiers = register_notifiers(ws);
    live_client_connected();

    ws.on("close", () => {
        connected_clients.delete(ws);
        unregister_notifiers();
        live_client_disconnected();
    });

    ws.on("message", async (message) => {
        const decoded = message.toString();
        console.log(`Received message: ${decoded}`);

        const data = JSON.parse(decoded) as MessageData;

        // find the handler for the action
        const handler = handlers[data.action];
        if (handler) {
            try {
                // call the handler with the payload
                await handler(ws, data.payload);
            } catch (error) {
                console.error(`Error handling action "${data.action}":`, error);

                ws.send(JSON.stringify({
                    action: "error",
                    payload: {
                        for: data
                    }
                }));
            }
        } else {
            console.warn(`No handler for action "${data.action}"`);

            ws.send(JSON.stringify({
                action: "invalid",
                payload: {
                    for: data
                }
            }));
        }
    });

    // welcome message
    ws.send(JSON.stringify({
        action: "hello",
        payload: {
            motd: "Served fresh!"
        }
    }));
});

http_server.on("listening", () => {
    console.log(`Server is listening on ws://${host}:${port}`);

    let effective_host = host;
    if (effective_host === "0.0.0.0") {
        effective_host = "localhost";
    }

    write_ws_url_for_editor(effective_host, port);
});

http_server.listen(port, host);
