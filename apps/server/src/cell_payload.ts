import type {CellData, CellPayload, PageCells} from "./types";
import {unwrap_plugin_reference} from "./types";

import {resolve_asset_url} from "./assets";
import {get_live_state} from "./live/state";
import {load_plugin} from "./plugins";

/**
 * Whether pressing a cell does anything, so clients can skip press feedback for cells that don't.
 */
const is_pushable = (cell: CellData | undefined): boolean => {
    const action = cell?.action;

    if (!action) {
        return false;
    }

    // links always do something, they change page
    if (action.kind !== "plugin") {
        return true;
    }

    const plugin_name = unwrap_plugin_reference(action.plugin).name;

    try {
        return typeof load_plugin(plugin_name).handle_push === "function";
    } catch {
        // a plugin that won't load should still be pressable, so the push_error flash shows it's broken
        return true;
    }
}

/**
 * Builds the set_cell payload for a cell, shared by every place that sends cells to clients.
 * @param col_idx the cell's column, sent as x
 * @param row_idx the cell's row, sent as y
 * @param cell the cell's data, or undefined for an empty cell
 */
export const build_cell_payload = (col_idx: number, row_idx: number, cell: CellData | undefined): CellPayload => {
    // live values from plugins win over the stored ones, field by field
    const live_state = get_live_state(row_idx, col_idx);
    if (cell && live_state) {
        cell = {...cell, ...live_state};
    }

    return {
        x: col_idx,
        y: row_idx,
        text: cell?.text || "",
        is_icon: cell?.text_is_icon || false,
        // resolved here as clients don't know the file's extension or version
        background: resolve_asset_url(cell?.background),
        pushable: is_pushable(cell)
    };
}

/**
 * Builds the payload for every filled cell in the grid, for sending the whole grid in one set_cells.
 * @param grid the grid to build payloads for
 */
export const build_grid_payload = (grid: PageCells): CellPayload[] => {
    const payloads: CellPayload[] = [];

    for (const [row_key, row] of Object.entries(grid)) {
        for (const [col_key, cell] of Object.entries(row)) {
            if (cell) {
                payloads.push(build_cell_payload(Number(col_key), Number(row_key), cell));
            }
        }
    }

    return payloads;
}
