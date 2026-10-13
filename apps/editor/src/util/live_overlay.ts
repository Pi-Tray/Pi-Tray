import {useEffect, useRef, useSyncExternalStore} from "react";

import type {CellData, PluginLiveControllable} from "pi-tray-server/src/types";

import {useWebSocket} from "../contexts/WSProvider";

/**
 * What the server last sent for a cell, with the background turned back into an asset id
 * so previews can use the asset's local copy rather than the server's url.
 */
export interface LiveCell {
    text: string;
    text_is_icon: boolean;
    background: string | null;
}

// keyed by "row,col". only what this connection has received, never written anywhere
const live_cells = new Map<string, LiveCell>();
const listeners = new Set<() => void>();

const cell_key = (row_idx: number, col_idx: number) => `${row_idx},${col_idx}`;

const notify = () => {
    listeners.forEach(listener => listener());
}

// asset urls look like /assets/<uuid>.<ext>?v=<version>, only the uuid matters to the editor
const ASSET_ID_IN_URL = /\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\./;

const asset_id_from_url = (url: unknown): string | null => {
    if (typeof url !== "string") {
        return null;
    }

    return url.match(ASSET_ID_IN_URL)?.[1] ?? null;
}

const handle_message = (event: MessageEvent) => {
    let message: any;

    try {
        message = JSON.parse(event.data);
    } catch {
        return;
    }

    if (message?.action !== "set_cell" || !message.payload) {
        return;
    }

    const {x, y, text, is_icon, background} = message.payload;
    if (typeof x !== "number" || typeof y !== "number") {
        return;
    }

    live_cells.set(cell_key(y, x), {
        text: typeof text === "string" ? text : "",
        text_is_icon: is_icon === true,
        background: asset_id_from_url(background)
    });

    notify();
}

/**
 * Forgets everything received for a cell, e.g. when its plugin changes and the old values no longer apply.
 * @param row_idx the cell's row
 * @param col_idx the cell's column
 */
export const clear_live_cell = (row_idx: number, col_idx: number) => {
    if (live_cells.delete(cell_key(row_idx, col_idx))) {
        notify();
    }
}

const clear_all_live_cells = () => {
    if (live_cells.size > 0) {
        live_cells.clear();
        notify();
    }
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Feeds live values from the server into the overlay. Use once, anywhere inside the WSProvider,
 * e.g. in the grid editor page, so every PushButton can read from it.<br>
 * Everything is cleared when the connection changes or closes, so stale values are never shown.
 */
export const useLiveOverlayConnection = () => {
    const ws = useWebSocket();

    useEffect(() => {
        clear_all_live_cells();

        if (!ws) {
            return;
        }

        ws.addEventListener("message", handle_message);
        ws.addEventListener("close", clear_all_live_cells);

        // the server only sends cells when they change, so ask for everything to fill the overlay straight away
        const request_all = () => ws.send(JSON.stringify({action: "all_buttons"}));

        if (ws.readyState === WebSocket.OPEN) {
            request_all();
        } else {
            ws.addEventListener("open", request_all, {once: true});
        }

        return () => {
            ws.removeEventListener("message", handle_message);
            ws.removeEventListener("close", clear_all_live_cells);
            ws.removeEventListener("open", request_all);
            clear_all_live_cells();
        };
    }, [ws]);
}

/**
 * A React hook that provides what the server last sent for a cell.
 * @param row_idx the cell's row
 * @param col_idx the cell's column
 * @param plugin_name the cell's current plugin, values are cleared whenever it changes
 * @returns the live values, or undefined if nothing has been received
 */
export const useLiveCell = (row_idx: number, col_idx: number, plugin_name: string | null): LiveCell | undefined => {
    const live_cell = useSyncExternalStore(subscribe, () => live_cells.get(cell_key(row_idx, col_idx)));

    // the old plugin's last values don't apply to the new one, so drop them rather than show them until it updates
    const previous_plugin_name = useRef(plugin_name);
    useEffect(() => {
        if (previous_plugin_name.current !== plugin_name) {
            previous_plugin_name.current = plugin_name;
            clear_live_cell(row_idx, col_idx);
        }
    }, [plugin_name, row_idx, col_idx]);

    return live_cell;
}

/**
 * Overlays live values onto a cell's stored data, but only for the fields its plugin controls.<br>
 * Everything else comes from grid.json, so edits show straight away and can't be hidden by a stale live value.
 * @param cell the cell's stored data
 * @param live_cell what the server last sent for the cell, if anything
 * @param live_controls the fields the cell's plugin sets live
 * @returns the cell data to display
 */
export const merge_live_cell = (cell: CellData, live_cell: LiveCell | undefined, live_controls: readonly PluginLiveControllable[] | undefined): CellData => {
    if (!live_cell || !live_controls || live_controls.length === 0) {
        return cell;
    }

    const merged_cell: CellData = {...cell};

    for (const field of live_controls) {
        if (field === "background") {
            merged_cell.background = live_cell.background ?? undefined;
        } else if (field === "label") {
            merged_cell.text = live_cell.text ?? undefined;
            merged_cell.text_is_icon = live_cell.text_is_icon ?? undefined;
        }
    }

    return merged_cell;
}
