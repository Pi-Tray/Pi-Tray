import type {MessageHandler} from "../types";
import {list_paired_devices} from "../paired_devices";

export default (async (client) => {
    client.send({action: "paired_devices", payload: list_paired_devices()});
}) as MessageHandler;
