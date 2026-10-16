import type {MessageHandler} from "../types";
import {submit_pairing_code} from "../pairing";

/**
 * Payload: {code: string, name?: string}, where name is what the device is listed as.
 */
export default (async (client, payload) => {
    client.send({action: "pairing_submit_result", payload: submit_pairing_code(payload?.code, payload?.name)});
}) as MessageHandler;
