import type { WebSocket } from "ws";

import {add_grid_change_listener, get_loaded_grid, get_shape_of_loaded_grid, GridChangeListener, remove_grid_change_listener} from "./data";
import {add_asset_change_listener} from "./assets";
import {build_cell_payload} from "./cell_payload";
import {add_live_state_listener} from "./live/state";

export const register_notifiers = (ws: WebSocket): (() => void) => {
    const send_cell = (col_idx: number, row_idx: number) => {
        const cell = get_loaded_grid()[row_idx]?.[col_idx];

        ws.send(JSON.stringify({
            action: "set_cell",
            payload: build_cell_payload(col_idx, row_idx, cell)
        }));
    }

    const shape_changed = async () => {
        console.log("Notifying client of shape change");

        // send the updated shape of the grid to the client
        ws.send(JSON.stringify({
            action: "size",
            payload: get_shape_of_loaded_grid()
        }));
    }

    const grid_changed: GridChangeListener = async (changes) => {
        for (const change of changes) {
            if (change === "shape") {
                shape_changed();
                continue;
            }

            // TODO: determine if text changed or just plugin (which we dont send)
            console.log(`Notifying client of cell change at ${change.row_idx},${change.col_idx}`);

            // an empty cell sends an empty payload, which clears the button
            send_cell(change.col_idx, change.row_idx);
        }
    }

    // grid.json doesn't change when an asset's image is replaced, so resend every cell using it
    const asset_changed = (asset_id: string) => {
        const grid = get_loaded_grid();

        for (const [row_key, row] of Object.entries(grid)) {
            for (const [col_key, cell] of Object.entries(row)) {
                if (cell?.background === asset_id) {
                    send_cell(Number(col_key), Number(row_key));
                }
            }
        }
    }

    add_grid_change_listener(grid_changed);
    const remove_asset_listener = add_asset_change_listener(asset_changed);

    const remove_live_listener = add_live_state_listener((row_idx, col_idx) => send_cell(col_idx, row_idx));

    // call when the socket closes, otherwise the listeners live forever and keep sending to a dead socket
    return () => {
        remove_grid_change_listener(grid_changed);
        remove_asset_listener();
        remove_live_listener();
    };
}