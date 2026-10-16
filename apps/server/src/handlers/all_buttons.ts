import type {MessageHandler} from "../types";

import {send_full_grid} from "../notifiers";

export default (async (client) => {
    send_full_grid(client);
}) as MessageHandler;
