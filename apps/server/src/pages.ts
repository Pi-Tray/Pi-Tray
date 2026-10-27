import fs from "fs";

import type {CellData, GridShape, PageCells, PageManifest, PluginReference} from "./types";
import {PAGE_ID_PATTERN, DEFAULT_GRID_SHAPE} from "./types";
import {data_dir, in_data_dir} from "@pi-tray/paths";

const MANIFEST_FILE_NAME = "pages.json";
const MANIFEST_PATH = in_data_dir(MANIFEST_FILE_NAME);
const PAGES_DIR = in_data_dir("pages");

// before pages, the one grid lived here. it's migrated once, then left alone as a backup
const LEGACY_GRID_PATH = in_data_dir("grid.json");

// also creates the data folder
fs.mkdirSync(PAGES_DIR, {recursive: true});

// the page the old grid becomes. fixed rather than random, so the editor and server migrating at once write the same thing
const MIGRATED_PAGE_ID = "main";
const MIGRATED_PAGE_NAME = "Home";
const UNNAMED_PAGE_NAME = "Untitled";

// one save can fire several watch events, and the editor may still be writing on the first
const RELOAD_DELAY_MS = 100;

// only ever called with ids that passed PAGE_ID_PATTERN, so an id can never point outside the pages folder
const page_file_path = (page_id: string) => in_data_dir("pages", `${page_id}.json`);

const is_valid_shape = (shape: unknown): shape is GridShape => {
    if (!shape || typeof shape !== "object") {
        return false;
    }

    const {rows, cols} = shape as GridShape;
    return Number.isInteger(rows) && Number.isInteger(cols) && rows > 0 && cols > 0;
}

// written to a temporary file then renamed over, so nothing ever reads a half written file
const write_json_atomic = (file_path: string, value: unknown) => {
    const temp_path = `${file_path}.tmp`;
    fs.writeFileSync(temp_path, JSON.stringify(value, null, 4), "utf-8");
    fs.renameSync(temp_path, file_path);
}

// migration from grid.json

// cells as grid.json stored them, with the plugin directly on the cell
type LegacyCell = Omit<CellData, "action"> & {plugin?: PluginReference};

const migrate_legacy_cell = ({plugin, ...rest}: LegacyCell): CellData => {
    return plugin ? {...rest, action: {kind: "plugin", plugin}} : rest;
}

/**
 * Turns grid.json into the home page, the first time the server runs with pages.
 * @throws if grid.json can't be read, rather than starting empty and leaving people thinking their grid is gone
 */
const migrate_legacy_grid = () => {
    if (fs.existsSync(MANIFEST_PATH)) {
        return;
    }

    let shape = DEFAULT_GRID_SHAPE;
    const row_data: PageCells = {};

    if (fs.existsSync(LEGACY_GRID_PATH)) {
        let legacy: {shape?: unknown, row_data?: {[row_idx: string]: {[col_idx: string]: LegacyCell}}};

        try {
            legacy = JSON.parse(fs.readFileSync(LEGACY_GRID_PATH, "utf-8"));
        } catch (error) {
            throw new Error(`Couldn't read ${LEGACY_GRID_PATH} to move it into pages, fix or remove it: ${error instanceof Error ? error.message : error}`);
        }

        // an empty grid.json from an older server is 0x0, which isn't worth keeping
        if (is_valid_shape(legacy.shape)) {
            shape = legacy.shape;
        }

        for (const [row_key, row] of Object.entries(legacy.row_data ?? {})) {
            for (const [col_key, cell] of Object.entries(row ?? {})) {
                if (cell) {
                    (row_data[Number(row_key)] ??= {})[Number(col_key)] = migrate_legacy_cell(cell);
                }
            }
        }

        console.log(`Moving ${LEGACY_GRID_PATH} into pages, it's left in place as a backup`);
    }

    // the manifest goes last, as its existence is what marks the migration done. a crash before it just migrates again
    write_json_atomic(page_file_path(MIGRATED_PAGE_ID), {row_data});

    const manifest: PageManifest = {
        home: MIGRATED_PAGE_ID,
        order: [MIGRATED_PAGE_ID],
        names: {[MIGRATED_PAGE_ID]: MIGRATED_PAGE_NAME},
        shape
    };
    write_json_atomic(MANIFEST_PATH, manifest);
}



/**
 * Reads pages.json, fixing what it can. The editor owns these files, so nothing is written back.
 * @returns the manifest, or null if it can't be used at all, e.g. it's mid-write or has no valid pages
 */
const read_manifest = (): PageManifest | null => {
    let raw: Partial<PageManifest>;

    try {
        raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
    } catch (error) {
        console.warn(`Couldn't read ${MANIFEST_PATH}:`, error instanceof Error ? error.message : error);
        return null;
    }

    // order decides which pages exist, names only names them
    const order: string[] = [];
    for (const page_id of Array.isArray(raw.order) ? raw.order : []) {
        if (typeof page_id !== "string" || !PAGE_ID_PATTERN.test(page_id)) {
            console.warn(`Ignoring the page id ${JSON.stringify(page_id)} in ${MANIFEST_PATH}, it isn't valid`);
        } else if (order.includes(page_id)) {
            console.warn(`Ignoring the repeated page id ${page_id} in ${MANIFEST_PATH}`);
        } else {
            order.push(page_id);
        }
    }

    if (order.length === 0) {
        console.warn(`${MANIFEST_PATH} has no valid pages`);
        return null;
    }

    const names: PageManifest["names"] = {};
    for (const page_id of order) {
        const name = raw.names?.[page_id];
        names[page_id] = typeof name === "string" && name.trim() ? name : UNNAMED_PAGE_NAME;
    }

    const home = typeof raw.home === "string" && order.includes(raw.home) ? raw.home : order[0];

    if (!is_valid_shape(raw.shape)) {
        console.warn(`${MANIFEST_PATH} has no valid shape, using ${DEFAULT_GRID_SHAPE.rows}x${DEFAULT_GRID_SHAPE.cols}`);
    }

    return {home, order, names, shape: is_valid_shape(raw.shape) ? raw.shape : DEFAULT_GRID_SHAPE};
}

/**
 * Reads a page's cells.
 * @returns its cells, empty if the file is missing, or null if it can't be parsed, e.g. it's mid-write
 */
const read_page = (page_id: string): PageCells | null => {
    const file_path = page_file_path(page_id);

    if (!fs.existsSync(file_path)) {
        console.warn(`The page ${page_id} has no file at ${file_path}, so it's empty`);
        return {};
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(file_path, "utf-8"));
        return parsed?.row_data && typeof parsed.row_data === "object" ? parsed.row_data : {};
    } catch (error) {
        console.warn(`Couldn't read ${file_path}:`, error instanceof Error ? error.message : error);
        return null;
    }
}

migrate_legacy_grid();

// used until a readable manifest turns up, e.g. if it was broken while the server was starting
let manifest: PageManifest = read_manifest() ?? {
    home: MIGRATED_PAGE_ID,
    order: [MIGRATED_PAGE_ID],
    names: {[MIGRATED_PAGE_ID]: MIGRATED_PAGE_NAME},
    shape: DEFAULT_GRID_SHAPE
};

const pages = new Map<string, PageCells>();
for (const page_id of manifest.order) {
    pages.set(page_id, read_page(page_id) ?? {});
}

console.log(`Loaded ${pages.size} page(s), ${manifest.shape.rows}x${manifest.shape.cols}`);

// --- access ---

export const get_manifest = (): PageManifest => manifest;

export const get_shape = (): GridShape => manifest.shape;

export const home_page_id = (): string => manifest.home;

export const page_exists = (page_id: string): boolean => pages.has(page_id);

/**
 * A page's cells, or undefined if there's no such page.<br>
 * Ids from messages or cell links are only ever looked up here, never used to open a file.
 */
export const get_page = (page_id: string): PageCells | undefined => pages.get(page_id);

export const get_page_name = (page_id: string): string | undefined => pages.has(page_id) ? manifest.names[page_id] : undefined;

// --- changes ---

export type PagesChange =
    | {kind: "shape"}
    | {kind: "cell", page: string, row_idx: number, col_idx: number}
    | {kind: "page_added" | "page_removed" | "page_renamed", page: string}
    | {kind: "home_changed"};

export type PagesChangeListener = (changes: PagesChange[]) => void | Promise<void>;

const change_listeners = new Set<PagesChangeListener>();

/**
 * Calls the listener with everything that changed whenever pages.json or a page file changes.
 * @returns a function that removes the listener
 */
export const add_pages_change_listener = (listener: PagesChangeListener): (() => void) => {
    change_listeners.add(listener);
    return () => {
        change_listeners.delete(listener);
    };
}

const notify = (changes: PagesChange[]) => {
    if (changes.length === 0) {
        return;
    }

    for (const listener of change_listeners) {
        Promise.resolve()
            .then(() => listener(changes))
            .catch((error) => console.error("Error in pages change listener:", error));
    }
}

const diff_cells = (page_id: string, old_cells: PageCells, new_cells: PageCells): PagesChange[] => {
    const changes: PagesChange[] = [];
    const row_keys = new Set([...Object.keys(old_cells), ...Object.keys(new_cells)]);

    for (const row_key of row_keys) {
        const old_row = old_cells[Number(row_key)] ?? {};
        const new_row = new_cells[Number(row_key)] ?? {};
        const col_keys = new Set([...Object.keys(old_row), ...Object.keys(new_row)]);

        for (const col_key of col_keys) {
            if (JSON.stringify(old_row[Number(col_key)]) !== JSON.stringify(new_row[Number(col_key)])) {
                changes.push({kind: "cell", page: page_id, row_idx: Number(row_key), col_idx: Number(col_key)});
            }
        }
    }

    return changes;
}

const reload_manifest = () => {
    const new_manifest = read_manifest();

    // keep what we have, the next save will bring it back
    if (!new_manifest) {
        return;
    }

    const old_manifest = manifest;
    manifest = new_manifest;

    const changes: PagesChange[] = [];

    if (old_manifest.shape.rows !== new_manifest.shape.rows || old_manifest.shape.cols !== new_manifest.shape.cols) {
        changes.push({kind: "shape"});
    }

    for (const page_id of old_manifest.order) {
        if (!new_manifest.order.includes(page_id)) {
            pages.delete(page_id);
            changes.push({kind: "page_removed", page: page_id});
        }
    }

    for (const page_id of new_manifest.order) {
        if (!old_manifest.order.includes(page_id)) {
            pages.set(page_id, read_page(page_id) ?? {});
            changes.push({kind: "page_added", page: page_id});
        } else if (old_manifest.names[page_id] !== new_manifest.names[page_id]) {
            changes.push({kind: "page_renamed", page: page_id});
        }
    }

    if (old_manifest.home !== new_manifest.home) {
        changes.push({kind: "home_changed"});
    }

    notify(changes);
}

const reload_page = (page_id: string) => {
    // a file for a page that isn't in the manifest, e.g. a leftover, means nothing until the editor adds it
    if (!pages.has(page_id)) {
        return;
    }

    const new_cells = read_page(page_id);

    if (!new_cells) {
        return;
    }

    const old_cells = pages.get(page_id) ?? {};
    pages.set(page_id, new_cells);

    notify(diff_cells(page_id, old_cells, new_cells));
}

const reload_timers = new Map<string, ReturnType<typeof setTimeout>>();

const reload_soon = (key: string, reload: () => void) => {
    clearTimeout(reload_timers.get(key));
    reload_timers.set(key, setTimeout(() => {
        reload_timers.delete(key);
        reload();
    }, RELOAD_DELAY_MS));
}

// fs.watch rather than fs.watchFile, which polls each file and wouldn't scale to many pages
fs.watch(data_dir, (_event, file_name) => {
    // some platforms don't say which file changed, then check the manifest anyway
    if (!file_name || file_name === MANIFEST_FILE_NAME) {
        reload_soon(MANIFEST_FILE_NAME, reload_manifest);
    }
});

fs.watch(PAGES_DIR, (_event, file_name) => {
    if (!file_name) {
        for (const page_id of pages.keys()) {
            reload_soon(page_id, () => reload_page(page_id));
        }
        return;
    }

    // e.g. <id>.json.tmp while the editor writes, which is followed by the rename to <id>.json
    const match = /^(.+)\.json$/.exec(file_name.toString());

    if (match && PAGE_ID_PATTERN.test(match[1])) {
        const page_id = match[1];
        reload_soon(page_id, () => reload_page(page_id));
    }
});