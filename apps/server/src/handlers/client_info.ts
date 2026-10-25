import type {MessageHandler} from "../types";
import {update_paired_device_client} from "../paired_devices";
import {broadcast_paired_devices} from "../pairing";

// the same characters the pi's updater accepts in a version
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/;

const is_version = (value: unknown): value is string => typeof value === "string" && VERSION_PATTERN.test(value);

/**
 * Payload: ClientInfo, from @pi-tray/types
 */
export default (async (client, payload) => {
    // the editor has its own version check against the supervisor
    if (client.identity.role !== "device") {
        return;
    }

    const version: unknown = payload?.version;

    // left out (undefined) when the client doesn't know yet
    const rejected_update: unknown = payload?.rejected_update;
    const rejected_update_valid = rejected_update === undefined || rejected_update === null || is_version(rejected_update);

    if (!is_version(version) || !rejected_update_valid) {
        client.send({action: "invalid", payload: {for: {action: "client_info", payload}}});
        return;
    }

    if (update_paired_device_client(client.identity.public_key, version, rejected_update as string | null | undefined)) {
        broadcast_paired_devices();
    }
}) as MessageHandler;
