import WebSocket from "ws";

import type {MessageHandler} from "../types";
import {connected_clients} from "../clients";

export default (async (ws, payload) => {
    for (const client of connected_clients) {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                action: "reload"
            }));
        }
    }
}) as MessageHandler;
