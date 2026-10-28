import type {MessageHandler} from "../types";
import {page_exists} from "../pages";

/**
 * The editor says which page it's editing, so its live previews and simulated pushes are for that page.<br>
 * Payload: {page: string}
 */
export default (async (client, payload) => {
    const page_id = payload?.page;

    if (typeof page_id !== "string" || !page_exists(page_id)) {
        client.send({action: "invalid", payload: {for: {action: "view_page", payload}}});
        return;
    }

    // the editor never goes back, so nothing to remember
    client.show_page(page_id, false);
}) as MessageHandler;
