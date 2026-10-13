import type {MessageHandler} from "../types";

import {clear_plugin_cache} from "../plugins";

/**
 * Drops every loaded plugin so the next push loads them fresh from disk.<br>
 * Useful while developing a plugin, since plugins otherwise stay loaded until plugin-env's packages change.
 */
export default (async (ws, payload) => {
    clear_plugin_cache();

    ws.send(JSON.stringify({
        action: "plugins_reloaded"
    }));
}) as MessageHandler;
