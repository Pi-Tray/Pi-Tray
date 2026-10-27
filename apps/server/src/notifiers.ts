import type {Client} from "./clients";

import type {CellPayload, ServerMessage} from "./types";
import {add_pages_change_listener, get_page, get_shape, home_page_id, PagesChangeListener} from "./pages";
import {add_asset_change_listener} from "./assets";
import {build_cell_payload, build_grid_payload} from "./cell_payload";
import {add_live_state_listener} from "./live/state";

// how long to collect changed cells before sending them, so changes close together go out as one set_cells
const FLUSH_DELAY_MS = 16;

interface CellNotifier {
    send_full_grid: () => void;
    unregister: () => void;
}

const notifiers = new WeakMap<Client, CellNotifier>();

const cell_key = (row_idx: number, col_idx: number) => `${row_idx},${col_idx}`;

const send_message = (client: Client, message: ServerMessage) => {
    client.send(message);
}

/**
 * Sends every filled cell to the client in one set_cells, e.g. when it first loads or its grid size changes.
 * @param client the client
 */
export const send_full_grid = (client: Client) => {
    notifiers.get(client)?.send_full_grid();
}

/**
 * Starts sending the client every change to the grid, its assets and live plugin values.<br>
 * Changed cells are batched into one set_cells, and cells that look the same as what the client already has are skipped.
 * @param client the client
 * @returns a function that stops the notifications, call it when the connection closes
 */
export const register_notifiers = (client: Client): (() => void) => {
    // TODO: the client's current page, once devices have one
    const current_page_id = () => home_page_id();
    const current_cells = () => get_page(current_page_id()) ?? {};

    // what the client was last sent for each cell, as JSON, so unchanged cells aren't sent again
    let last_sent = new Map<string, string>();

    const pending_cells = new Map<string, {row_idx: number, col_idx: number}>();
    let flush_timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
        flush_timer = null;

        const grid = current_cells();
        const payloads: CellPayload[] = [];

        for (const [key, {row_idx, col_idx}] of pending_cells) {
            const payload = build_cell_payload(col_idx, row_idx, grid[row_idx]?.[col_idx]);
            const payload_json = JSON.stringify(payload);

            // e.g. only the cell's plugin or config changed, which clients don't see
            if (last_sent.get(key) === payload_json) {
                continue;
            }

            last_sent.set(key, payload_json);
            payloads.push(payload);
        }

        pending_cells.clear();

        if (payloads.length > 0) {
            send_message(client, {action: "update_cells", payload: payloads});
        }
    }

    const queue_cell = (row_idx: number, col_idx: number) => {
        pending_cells.set(cell_key(row_idx, col_idx), {row_idx, col_idx});

        if (flush_timer === null) {
            flush_timer = setTimeout(flush, FLUSH_DELAY_MS);
        }
    }

    const notifier_send_full_grid = () => {
        const payloads = build_grid_payload(current_cells());

        // the full grid covers anything still waiting to be sent
        pending_cells.clear();

        // the client starts from an empty grid, so forget everything sent before
        last_sent = new Map();
        for (const payload of payloads) {
            last_sent.set(cell_key(payload.y, payload.x), JSON.stringify(payload));
        }

        send_message(client, {action: "update_cells", payload: payloads});
    }

    const pages_changed: PagesChangeListener = (changes) => {
        for (const change of changes) {
            switch (change.kind) {
                case "shape":
                    // the client rebuilds its grid and asks for every cell again, so no need to send cells here
                    send_message(client, {action: "size", payload: get_shape()});
                    break;
                case "cell":
                    // an empty cell sends an empty payload, which clears the button
                    if (change.page === current_page_id()) {
                        queue_cell(change.row_idx, change.col_idx);
                    }
                    break;
                // TODO: page_removed, page_renamed and home_changed, once devices have a current page
            }
        }
    }

    // grid.json doesn't change when an asset's image is replaced, so resend every cell using it
    const asset_changed = (asset_id: string) => {
        const grid = current_cells();

        for (const [row_key, row] of Object.entries(grid)) {
            for (const [col_key, cell] of Object.entries(row)) {
                if (cell?.background === asset_id) {
                    queue_cell(Number(row_key), Number(col_key));
                }
            }
        }
    }

    const remove_pages_listener = add_pages_change_listener(pages_changed);
    const remove_asset_listener = add_asset_change_listener(asset_changed);
    const remove_live_listener = add_live_state_listener(queue_cell);

    const unregister = () => {
        remove_pages_listener();
        remove_asset_listener();
        remove_live_listener();

        if (flush_timer !== null) {
            clearTimeout(flush_timer);
        }

        notifiers.delete(client);
    };

    notifiers.set(client, {send_full_grid: notifier_send_full_grid, unregister});

    // call when the connection closes, otherwise the listeners live forever and keep sending to a dead client
    return unregister;
}
