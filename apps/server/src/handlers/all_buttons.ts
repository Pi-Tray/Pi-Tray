import type {MessageHandler} from "../types";

import {send_page} from "../notifiers";

/**
 * Sends the client's whole current page, replacing whatever it shows.
 */
export default (async (client) => {
    send_page(client);
}) as MessageHandler;
