import type {CellAction, MessageHandler} from "../types";
import type {Client} from "../clients";

import {get_page, home_page_for, home_page_id, page_exists} from "../pages";
import {set_device_page} from "../paired_devices";
import {load_plugin} from "../plugins";
import {unwrap_plugin_reference} from "../types";
import {plugin_context} from "../plugin_context";
import {package_data_folder} from "@pi-tray/installer/read";
import {split_plugin_reference} from "@pi-tray/package-spec";

type LinkAction = Exclude<CellAction, {kind: "plugin"}>;

/**
 * Whether following a link would go anywhere. Only a link to a page that's since been deleted wouldn't.
 */
const link_works = (action: LinkAction): boolean => action.kind !== "page" || page_exists(action.id);

/**
 * Follows a link cell, changing the client's page, which sends it the new one.
 */
const follow_link = (client: Client, action: LinkAction) => {
    const is_device = client.identity.role === "device";

    switch (action.kind) {
        case "page":
            client.show_page(action.id);
            break;
        case "back":
            // with nowhere to go back to, back goes home, so it never looks broken
            if (!client.go_back(page_exists)) {
                client.show_page(is_device ? home_page_for(client.identity.public_key) : home_page_id());
            }
            break;
        case "home":
            client.show_page(is_device ? home_page_for(client.identity.public_key) : home_page_id());
            break;
    }

    // so a device comes back to the same page after reconnecting
    if (is_device) {
        set_device_page(client.identity.public_key, client.current_page);
    }
}

export default (async (client, payload) => {
    const cells = get_page(client.current_page) ?? {};
    const action = cells[payload.y]?.[payload.x]?.action;

    if (!action) {
        // nothing to do if the cell is empty or has no action
        return;
    }

    if (action.kind !== "plugin") {
        const works = link_works(action);

        // replied before the new page is sent, which clears the client's press states. the other way round, the reply
        // would flash whichever cell is in the same place on the new page
        client.send({action: works ? "push_ok" : "push_error", payload: {x: payload.x, y: payload.y}});

        if (works) {
            follow_link(client, action);
        }
        return;
    }

    const {name: plugin_name, config: plugin_config} = unwrap_plugin_reference(action.plugin);

    try {

        const plugin = load_plugin(plugin_name);

        if (plugin.handle_push) {
            const handle_push = plugin.handle_push;

            const data_dir = package_data_folder(split_plugin_reference(plugin_name).package_name);

            await plugin_context.run({kind: "push", plugin_name, x: payload.x, y: payload.y}, () => handle_push({
                x: payload.x,
                y: payload.y,
                config: plugin_config,
                ws: client.as_plugin_socket(),
                data_dir
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
