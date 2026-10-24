import type {IncomingMessage, ServerResponse} from "http";

import {handle_asset_request} from "./assets";
import {handle_client_update_request} from "./client_update";

/**
 * Sends each request to whatever serves its path, and 404s anything else.
 */
export const handle_http_request = (request: IncomingMessage, response: ServerResponse) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

    if (pathname.startsWith("/assets/")) {
        handle_asset_request(request, response);
    } else if (pathname.startsWith("/client-update/")) {
        handle_client_update_request(request, response);
    } else {
        response.writeHead(404, {"Access-Control-Allow-Origin": "*"});
        response.end();
    }
}
