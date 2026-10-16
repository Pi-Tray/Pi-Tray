import type {MessageHandler} from "../types";
import {list_paired_devices} from "../paired_devices";
import {online_device_keys} from "../clients";

export default (async (client) => {
    client.send({action: "paired_devices", payload: list_paired_devices(online_device_keys())});
}) as MessageHandler;
