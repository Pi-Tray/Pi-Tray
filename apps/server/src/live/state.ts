import type {CellData, PluginLiveControllable, PluginLiveControlledField} from "../types";

/**
 * The values live plugins have set for a cell, overlaid on top of the cell's data from grid.json.
 */
export type LiveCellState = Partial<Pick<CellData, PluginLiveControlledField<PluginLiveControllable>>>;

export type LiveStateListener = (row_idx: number, col_idx: number) => void;

// keyed by "row,col". only in memory, live values are never written to grid.json
const live_states = new Map<string, LiveCellState>();

const listeners = new Set<LiveStateListener>();

const cell_key = (row_idx: number, col_idx: number) => `${row_idx},${col_idx}`;

const notify = (row_idx: number, col_idx: number) => {
    for (const listener of listeners) {
        try {
            listener(row_idx, col_idx);
        } catch (error) {
            console.error("Error in live state listener:", error);
        }
    }
}

/**
 * Gets the live values for a cell.
 * @param row_idx the cell's row
 * @param col_idx the cell's column
 * @returns the live values, or undefined if no live plugin has set any
 */
export const get_live_state = (row_idx: number, col_idx: number): LiveCellState | undefined => {
    return live_states.get(cell_key(row_idx, col_idx));
}

/**
 * Merges new live values into a cell's existing ones, notifying listeners only if anything actually changed.
 * @param row_idx the cell's row
 * @param col_idx the cell's column
 * @param state the values to merge in
 */
export const set_live_state = (row_idx: number, col_idx: number, state: LiveCellState) => {
    const key = cell_key(row_idx, col_idx);
    const previous_state = live_states.get(key);
    const merged_state = {...previous_state, ...state};

    // skip identical updates, e.g. a clock plugin re-sending the same minute
    if (previous_state && JSON.stringify(previous_state) === JSON.stringify(merged_state)) {
        return;
    }

    live_states.set(key, merged_state);
    notify(row_idx, col_idx);
}

/**
 * Removes a cell's live values, so it goes back to showing its data from grid.json.
 * @param row_idx the cell's row
 * @param col_idx the cell's column
 */
export const clear_live_state = (row_idx: number, col_idx: number) => {
    if (live_states.delete(cell_key(row_idx, col_idx))) {
        notify(row_idx, col_idx);
    }
}

/**
 * Calls the listener whenever a cell's live values change or are cleared.
 * @param listener called with the cell's row and column
 * @returns a function that removes the listener
 */
export const add_live_state_listener = (listener: LiveStateListener): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
