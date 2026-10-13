import {exists, writeTextFile, readTextFile, watch} from "@tauri-apps/plugin-fs";
import { join, dataDir } from "@tauri-apps/api/path";

import {useCallback, useEffect, useState} from "react";

// TODO: we need to do this more properly
import type { CellData } from "pi-tray-server/src/types"

const appdata = await dataDir();
const GRID_FILE = await join(appdata, "pi-tray", "grid.json");

// TODO: this is slapped together from the config code, could be cleaner

export interface GridShape {
    rows: number;
    cols: number;
}

export type GridRowData = { [row_idx: number]: { [col_idx: number]: CellData } };

interface Grid {
    shape: GridShape;
    row_data: GridRowData;
}

const DEFAULTS = {
    shape: {
        rows: 3,
        cols: 5
    },
    row_data: {}
} as Grid;

export type GridKey = keyof Grid;

// write the default grid file if it does not exist
if (!await exists(GRID_FILE)) {
    await writeTextFile(GRID_FILE, JSON.stringify(DEFAULTS, null, 4));
}

// TODO: make this proper like it works in the server, it knows what cell changed
// TODO: specific function type for shape change and row data change to avoid casting
type ChangeListener = (value: GridShape | GridRowData) => void;
const change_listeners: Partial<Record<GridKey, ChangeListener[]>> = {};

/**
 * Subscribe to changes in a grid value.
 * @param key the key of the grid value to subscribe to (either `shape` or `row_data`)
 * @param callback the callback to call when the grid value changes
 */
export const subscribe_to_grid_change = (key: GridKey, callback: ChangeListener): void => {
    if (!change_listeners[key]) {
        change_listeners[key] = [];
    }

    change_listeners[key].push(callback);
}

/**
 * Unsubscribe from changes in a grid value.
 * @param key the key of the grid value to unsubscribe from (either `shape` or `row_data`)
 * @param callback a reference equivalent to the callback passed to `subscribe_to_grid_change`
 */
export const unsubscribe_from_grid_change = (key: GridKey, callback: ChangeListener): void => {
    if (change_listeners[key]) {
        // filter out the callback from the listeners
        change_listeners[key] = change_listeners[key].filter(cb => cb !== callback);
    }
}

const notify_grid_change = (key: GridKey, value: GridShape | GridRowData): void => {
    if (change_listeners[key]) {
        change_listeners[key].forEach(callback => callback(value));
    }
}


/**
 * Get the configured shape of the grid from the grid file, or the default value if it does not exist.
 * @returns the shape of the grid as an object with `rows` and `cols` properties
 */
export const get_grid_shape = async (): Promise<GridShape> => {
    if (!await exists(GRID_FILE)) {
        // write default grid and return the default value
        await writeTextFile(GRID_FILE, JSON.stringify(DEFAULTS, null, 4));
        return DEFAULTS.shape;
    }

    const grid = JSON.parse(await readTextFile(GRID_FILE));
    if ("shape" in grid) {
        return grid.shape;
    } else {
        // if the key does not exist for some reason, return the default value
        return DEFAULTS.shape;
    }
}

export const get_grid_row_data = async (): Promise<GridRowData> => {
    if (!await exists(GRID_FILE)) {
        // write default grid and return the default value
        await writeTextFile(GRID_FILE, JSON.stringify(DEFAULTS, null, 4));
        return DEFAULTS.row_data;
    }

    const grid = JSON.parse(await readTextFile(GRID_FILE));
    if ("row_data" in grid) {
        return grid.row_data;
    } else {
        // if the key does not exist for some reason, return the default value
        return DEFAULTS.row_data;
    }
}

export const get_grid_cell = async (row_idx: number, col_idx: number): Promise<CellData | undefined> => {
    const row_data = await get_grid_row_data();
    return row_data[row_idx]?.[col_idx];
}

/**
 * Set the shape of the grid in the grid file.
 * @param shape the new shape of the grid as an object with `rows` and `cols` properties
 */
export const set_grid_shape = async (shape: GridShape): Promise<void> => {
    // TODO: validate

    let grid: Grid;

    if (await exists(GRID_FILE)) {
        grid = JSON.parse(await readTextFile(GRID_FILE));
    } else {
        grid = DEFAULTS;
    }

    grid.shape = shape;
    await writeTextFile(GRID_FILE, JSON.stringify(grid, null, 4));

    notify_grid_change("shape", shape);
}

export const set_grid_row_data = async (row_data: GridRowData): Promise<void> => {
    let grid: Grid;

    if (await exists(GRID_FILE)) {
        grid = JSON.parse(await readTextFile(GRID_FILE));
    } else {
        grid = DEFAULTS;
    }

    grid.row_data = row_data;
    await writeTextFile(GRID_FILE, JSON.stringify(grid, null, 4));

    notify_grid_change("row_data", row_data);
}

export const set_grid_cell = async (row_idx: number, col_idx: number, cell_data: CellData): Promise<void> => {
    const row_data = await get_grid_row_data();

    if (!row_data[row_idx]) {
        row_data[row_idx] = {};
    }

    row_data[row_idx][col_idx] = cell_data;

    await set_grid_row_data(row_data);
}

export const delete_grid_cell = async (row_idx: number, col_idx: number): Promise<void> => {
    const row_data = await get_grid_row_data();

    if (!row_data[row_idx]?.[col_idx]) {
        return;
    }

    delete row_data[row_idx][col_idx];

    // drop the row entirely if it has no cells left, to keep grid.json tidy
    if (Object.keys(row_data[row_idx]).length === 0) {
        delete row_data[row_idx];
    }

    await set_grid_row_data(row_data);
}

/**
 * A React hook to get and set the grid shape.<br>
 * It will automatically subscribe to changes to the grid shape and update the state when it changes.
 * @return a tuple containing the current value and a function to set the value
 */
export const useGridShape = (): [GridShape, (value: GridShape) => Promise<void>] => {
    const [value, setValue] = useState<GridShape>(DEFAULTS.shape);

    useEffect(() => {
        // set initial value on mount
        get_grid_shape().then(initial_value => {
            setValue(initial_value);
        });

        // create a fixed callback to allow for cleanup
        const callback = (new_value: GridShape | GridRowData) => {
            setValue(new_value as GridShape);
        }

        subscribe_to_grid_change("shape", callback);

        return () => {
            // cleanup the subscription on unmount
            unsubscribe_from_grid_change("shape", callback);
        };
    }, []);

    // create setter wrapper
    const setKeyValue = async (newValue: GridShape) => {
        await set_grid_shape(newValue);
    };

    return [value, setKeyValue];
}

export const useGridRowData = (): [GridRowData, (value: GridRowData) => Promise<void>] => {
    const [value, setValue] = useState<GridRowData>(DEFAULTS.row_data);

    useEffect(() => {
        // set initial value on mount
        get_grid_row_data().then(initial_value => {
            setValue(initial_value);
        });

        // create a fixed callback to allow for cleanup
        const callback = (new_value: GridShape | GridRowData) => {
            setValue(new_value as GridRowData);
        }

        subscribe_to_grid_change("row_data", callback);

        return () => {
            // cleanup the subscription on unmount
            unsubscribe_from_grid_change("row_data", callback);
        };
    }, []);

    // create setter wrapper
    const setKeyValue = async (newValue: GridRowData) => {
        await set_grid_row_data(newValue);
    }

    return [value, setKeyValue];
}

export const useGridCell = (row_idx: number, col_idx: number): [CellData | undefined | null, (cell_data: CellData) => Promise<void>] => {
    const [value, setValue] = useState<CellData | undefined | null>(null);

    useEffect(() => {
        // set initial value on mount
        get_grid_cell(row_idx, col_idx).then(initial_value => {
            setValue(initial_value);
        });

        // create a fixed callback to allow for cleanup
        const callback = (new_value: GridShape | GridRowData) => {
            const row_data = new_value as GridRowData;

            // check the value has changed, using stringify to do deep comparison and avoid reference inequality issues
            setValue(prev => {
                const new_cell = row_data[row_idx]?.[col_idx];
                if (JSON.stringify(prev) !== JSON.stringify(new_cell)) {
                    return new_cell;
                } else {
                    return prev;
                }
            });
        }

        subscribe_to_grid_change("row_data", callback);

        return () => {
            // cleanup the subscription on unmount
            unsubscribe_from_grid_change("row_data", callback);
        };
    }, [row_idx, col_idx]);

    // create setter wrapper
    const setKeyValue = useCallback(
        async (new_value: CellData) => {
            await set_grid_cell(row_idx, col_idx, new_value);
        },
        [row_idx, col_idx]
    );

    return [value, setKeyValue];
}

// TODO: consolidate those above to a single useGridKey hook, and then make custom hooks from that

// load the grid file into a last known state
// TODO: convert this so that it's a cache for get_grid_shape and get_grid_row_data
let last_grid: Grid = DEFAULTS;
if (await exists(GRID_FILE)) {
    last_grid = JSON.parse(await readTextFile(GRID_FILE));
}

// watch for changes to the grid file and update the state accordingly, calling set_grid_shape or set_grid_row_data if the value changes for a key
await watch(GRID_FILE, async (event) => {
    if (typeof event.type === "object" && "modify" in event.type) {
        const new_grid = JSON.parse(await readTextFile(GRID_FILE));

        // check for changes in the grid file
        for (const key of ["shape", "row_data"]) {
            if (JSON.stringify(new_grid[key as GridKey]) !== JSON.stringify(last_grid[key as GridKey])) {
                // if the value has changed, notify listeners
                notify_grid_change(key as GridKey, new_grid[key]);
            }
        }

        // update the last known state
        last_grid = new_grid;
    }
});
