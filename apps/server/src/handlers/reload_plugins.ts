import type {MessageHandler} from "../types";

import {clear_plugin_cache} from "../plugins";

/**
 * Drops every loaded plugin so the next push loads them fresh from disk.<br>
 * Useful while developing a plugin, since plugins otherwise stay loaded until plugin-env's packages change.
 */
export default (async (client, payload) => {
    await clear_plugin_cache();

    client.send({
        action: "plugins_reloaded"
    });
}) as MessageHandler;
