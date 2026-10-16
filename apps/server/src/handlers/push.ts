import type {MessageHandler} from "../types";

import {get_loaded_grid} from "../data";
import {load_plugin} from "../plugins";
import {unwrap_plugin_reference} from "../types";
import {plugin_context} from "../plugin_context";

export default (async (client, payload) => {
    const grid = get_loaded_grid();

    const cell = grid[payload.y]?.[payload.x];
    if (!cell || !cell.plugin) {
        // nothing to do if the cell is empty or has no plugin
        return;
    }

    const {name: plugin_name, config: plugin_config} = unwrap_plugin_reference(cell.plugin);

    try {

        const plugin = load_plugin(plugin_name);

        if (plugin.handle_push) {
            const handle_push = plugin.handle_push;

            await plugin_context.run({kind: "push", plugin_name, x: payload.x, y: payload.y}, () => handle_push({
                x: payload.x,
                y: payload.y,
                config: plugin_config,
                ws: client.as_plugin_socket()
            }));
        }
    } catch (error) {
        console.error(`Error handling push for plugin ${plugin_name}:`, error);

        // send an error message back to the client
        client.send({
            action: "push_error",
            payload: {
                x: payload.x,
                y: payload.y,
            }
        });

        return;
    }

    // ack the push action
    client.send({
        action: "push_ok",
        payload: {
            x: payload.x,
            y: payload.y,
        }
    });
}) as MessageHandler;
