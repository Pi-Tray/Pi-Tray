import {useCallback, useEffect, useRef, useSyncExternalStore} from "react";

import type {CellData, PluginLiveControllable, ServerMessage} from "@pi-tray/types";
import {ASSET_PATH_PATTERN} from "@pi-tray/types";

import {useChannel, useChannelMessage, useChannelReady, useChannelStatus} from "../contexts/WSProvider";

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
const asset_id_from_url = (url: string | null): string | null => {
    if (!url) {
        return null;
    }

    return url.split("?")[0].match(ASSET_PATH_PATTERN)?.[1] ?? null;
}

const handle_message = (message: ServerMessage) => {
    if (message.action !== "update_cells" || !Array.isArray(message.payload)) {
        return;
    }

    for (const {x, y, text, is_icon, background} of message.payload) {
        if (typeof x !== "number" || typeof y !== "number") {
            continue;
        }

        live_cells.set(cell_key(y, x), {
            text: typeof text === "string" ? text : "",
            text_is_icon: is_icon === true,
            background: asset_id_from_url(background)
        });
    }

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
    const channel = useChannel();
    const status = useChannelStatus();

    useChannelMessage(handle_message);

    // the server only sends cells when they change, so ask for everything to fill the overlay straight away
    const request_all = useCallback(() => channel?.send({action: "all_buttons"}), [channel]);
    useChannelReady(request_all);

    // never show stale values once the connection drops or changes
    useEffect(() => {
        if (status !== "ready") {
            clear_all_live_cells();
        }
    }, [status]);

    // forget everything when the hook unmounts
    useEffect(() => clear_all_live_cells, []);
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
 * Everything else comes from the page file, so edits show straight away and can't be hidden by a stale live value.
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
