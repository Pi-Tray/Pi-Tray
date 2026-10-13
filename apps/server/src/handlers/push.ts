import type {MessageHandler} from "../types";

import {get_loaded_grid} from "../data";
import {load_plugin} from "../plugins";
import {plugin_context} from "../plugin_context";

export default (async (ws, payload) => {
    const grid = get_loaded_grid();

    const cell = grid[payload.y]?.[payload.x];
    if (!cell || !cell.plugin) {
        // nothing to do if the cell is empty or has no plugin
        return;
    }

    const plugin_name = typeof cell.plugin === "string" ? cell.plugin : cell.plugin.name;

    try {
        const plugin_config = typeof cell.plugin === "string" ? undefined : cell.plugin.config;

        const plugin = load_plugin(plugin_name);

        if (plugin.handle_push) {
            const handle_push = plugin.handle_push;

            await plugin_context.run({kind: "push", plugin_name, x: payload.x, y: payload.y}, () => handle_push({
                x: payload.x,
                y: payload.y,
                config: plugin_config,
                ws: ws
            }));
        }
    } catch (error) {
        console.error(`Error handling push for plugin ${plugin_name}:`, error);

        // send an error message back to the client
        ws.send(JSON.stringify({
            action: "push_error",
            payload: {
                x: payload.x,
                y: payload.y,
            }
        }));

        return;
    }

    // ack the push action
    ws.send(JSON.stringify({
        action: "push_ok",
        payload: {
            x: payload.x,
            y: payload.y,
        }
    }));
}) as MessageHandler;
