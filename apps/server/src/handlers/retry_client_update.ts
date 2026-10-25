import type {MessageHandler} from "../types";
import {connected_clients} from "../clients";

/**
 * Asks a device to install the client update it rolled back, now the editor says to try again.<br>
 * Payload: {public_key: string}
 */
export default (async (client, payload) => {
    const public_key = payload?.public_key;
    let asked = false;

    for (const other of connected_clients) {
        if (typeof public_key === "string" && other.identity.role === "device" && other.identity.public_key === public_key) {
            other.send({action: "retry_client_update"});
            asked = true;
        }
    }

    // not paired, or offline, so there's nobody to ask
    if (!asked) {
        client.send({action: "invalid", payload: {for: {action: "retry_client_update", payload}}});
    }
}) as MessageHandler;
