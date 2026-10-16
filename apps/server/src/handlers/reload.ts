import type {MessageHandler} from "../types";
import {connected_clients} from "../clients";

export default (async (client, payload) => {
    for (const other of connected_clients) {
        if (other !== client) {
            other.send({action: "reload"});
        }
    }
}) as MessageHandler;
