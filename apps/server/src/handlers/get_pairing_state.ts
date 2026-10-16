import type {MessageHandler} from "../types";
import {get_pairing_state} from "../pairing";

export default (async (client) => {
    client.send({action: "pairing_state", payload: get_pairing_state()});
}) as MessageHandler;
