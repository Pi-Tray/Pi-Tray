import type {MessageHandler} from "../types";

import {send_full_grid} from "../notifiers";

export default (async (ws, payload) => {
    send_full_grid(ws);
}) as MessageHandler;