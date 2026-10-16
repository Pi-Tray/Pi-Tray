import {CloseCode} from "@pi-tray/secure-channel";

import type {MessageHandler} from "../types";
import {revoke_paired_device} from "../paired_devices";
import {broadcast_paired_devices} from "../pairing";
import {connected_clients} from "../clients";

/**
 * Payload: {public_key: string}
 */
export default (async (client, payload) => {
    const public_key = payload?.public_key;

    if (typeof public_key !== "string" || !revoke_paired_device(public_key)) {
        client.send({action: "invalid", payload: {for: {action: "revoke_paired_device", payload}}});
        return;
    }

    console.log("Revoked a paired device");

    // drop it now rather than letting it stay connected until it next reconnects
    for (const other of connected_clients) {
        if (other.identity.role === "device" && other.identity.public_key === public_key) {
            other.disconnect(CloseCode.LOGIN_FAILED, "device revoked");
        }
    }

    broadcast_paired_devices();
}) as MessageHandler;
