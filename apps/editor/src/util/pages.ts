import {exists, mkdir, readTextFile, remove, rename, watch, writeTextFile} from "@tauri-apps/plugin-fs";
import {useCallback, useEffect, useState} from "react";

import {DEFAULT_GRID_SHAPE, PAGE_ID_PATTERN} from "@pi-tray/types";
import type {CellData, GridShape, PageCells, PageData, PageManifest, PageSettings, PluginReference} from "@pi-tray/types";

import {data_dir, in_data_dir} from "./paths";

// the editor owns these files, the server only reads them. the reading rules match the server's pages.ts, so both agree
// on what a broken or hand-edited manifest means

const MANIFEST_PATH = await in_data_dir("pages.json");
const PAGES_DIR = await in_data_dir("pages");

// before pages, the one grid lived here. it's migrated once, then left alone as a backup
const LEGACY_GRID_PATH = await in_data_dir("grid.json");

// the page the old grid becomes. fixed rather than random, so the editor and server migrating at once write the same thing
const MIGRATED_PAGE_ID = "main";
const MIGRATED_PAGE_NAME = "Home";
const UNNAMED_PAGE_NAME = "Untitled";
const NEW_PAGE_NAME = "New page";

// only ever called with ids that passed PAGE_ID_PATTERN, so an id can never point outside the pages folder
const page_file_path = (page_id: string) => in_data_dir("pages", `${page_id}.json`);

const is_valid_shape = (shape: unknown): shape is GridShape => {
    if (!shape || typeof shape !== "object") {
        return false;
    }

    const {rows, cols} = shape as GridShape;
    return Number.isInteger(rows) && Number.isInteger(cols) && rows > 0 && cols > 0;
}

// written to a temporary file then renamed over, so the server never reads a half written file
const write_json_atomic = async (file_path: string, value: unknown) => {
    const temp_path = `${file_path}.tmp`;
    await writeTextFile(temp_path, JSON.stringify(value, null, 4));
    await rename(temp_path, file_path);
}

// --- migration from grid.json ---

// cells as grid.json stored them, with the plugin directly on the cell
type LegacyCell = Omit<CellData, "action"> & {plugin?: PluginReference};

const migrate_legacy_cell = ({plugin, ...rest}: LegacyCell): CellData => {
    return plugin ? {...rest, action: {kind: "plugin", plugin}} : rest;
}

/**
 * Turns grid.json into the home page, if neither the editor nor the server has yet.
 * @throws if grid.json can't be read, rather than starting empty and leaving people thinking their grid is gone
 */
const migrate_legacy_grid = async () => {
    if (await exists(MANIFEST_PATH)) {
        return;
    }

    let shape = DEFAULT_GRID_SHAPE;
    const row_data: PageCells = {};

    if (await exists(LEGACY_GRID_PATH)) {
        const legacy: {shape?: unknown, row_data?: {[row_idx: string]: {[col_idx: string]: LegacyCell}}} = JSON.parse(await readTextFile(LEGACY_GRID_PATH));

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
    }

    // the manifest goes last, as its existence is what marks the migration done
    await write_json_atomic(await page_file_path(MIGRATED_PAGE_ID), {row_data});

    const manifest: PageManifest = {
        home: MIGRATED_PAGE_ID,
        order: [MIGRATED_PAGE_ID],
        names: {[MIGRATED_PAGE_ID]: MIGRATED_PAGE_NAME},
        shape
    };
    await write_json_atomic(MANIFEST_PATH, manifest);
}

// --- reading ---

/**
 * Reads pages.json, fixing what it can: order decides which pages exist, a page with no name is "Untitled", and a missing
 * home falls back to the first page.
 * @returns the manifest, or null if it can't be used at all, e.g. it's mid-write or has no valid pages
 */
const read_manifest = async (): Promise<PageManifest | null> => {
    let raw: Partial<PageManifest>;

    try {
        raw = JSON.parse(await readTextFile(MANIFEST_PATH));
    } catch (error) {
        console.warn("Couldn't read pages.json:", error);
        return null;
    }

    const order: string[] = [];
    for (const page_id of Array.isArray(raw.order) ? raw.order : []) {
        if (typeof page_id === "string" && PAGE_ID_PATTERN.test(page_id) && !order.includes(page_id)) {
            order.push(page_id);
        }
    }

    if (order.length === 0) {
        return null;
    }

    const names: PageManifest["names"] = {};
    for (const page_id of order) {
        const name = raw.names?.[page_id];
        names[page_id] = typeof name === "string" && name.trim() ? name : UNNAMED_PAGE_NAME;
    }

    const home = typeof raw.home === "string" && order.includes(raw.home) ? raw.home : order[0];

    return {home, order, names, shape: is_valid_shape(raw.shape) ? raw.shape : DEFAULT_GRID_SHAPE};
}

const EMPTY_PAGE: PageData = {row_data: {}};

const settings_of = ({row_data: _row_data, ...settings}: PageData): PageSettings => settings;

/**
 * @returns the page's cells and settings, empty if its file is missing, or null if it can't be parsed, e.g. it's mid-write
 */
const read_page = async (page_id: string): Promise<PageData | null> => {
    const file_path = await page_file_path(page_id);

    if (!await exists(file_path)) {
        return EMPTY_PAGE;
    }

    try {
        const parsed = JSON.parse(await readTextFile(file_path));

        if (!parsed || typeof parsed !== "object") {
            return EMPTY_PAGE;
        }

        return {...parsed, row_data: parsed.row_data && typeof parsed.row_data === "object" ? parsed.row_data : {}};
    } catch (error) {
        console.warn(`Couldn't read page ${page_id}:`, error);
        return null;
    }
}

await mkdir(PAGES_DIR, {recursive: true});
await migrate_legacy_grid();

let manifest: PageManifest = await read_manifest() ?? {
    home: MIGRATED_PAGE_ID,
    order: [MIGRATED_PAGE_ID],
    names: {[MIGRATED_PAGE_ID]: MIGRATED_PAGE_NAME},
    shape: DEFAULT_GRID_SHAPE
};

const pages = new Map<string, PageData>();
for (const page_id of manifest.order) {
    pages.set(page_id, await read_page(page_id) ?? EMPTY_PAGE);
}

// --- change listeners ---

const manifest_listeners = new Set<(manifest: PageManifest) => void>();
const cell_listeners = new Map<string, Set<(cells: PageCells) => void>>();
const settings_listeners = new Map<string, Set<(settings: PageSettings) => void>>();

const notify_manifest = () => {
    manifest_listeners.forEach((listener) => listener(manifest));
}

/**
 * Tells listeners about whichever of the page's cells and settings differ from before.
 */
const notify_page = (page_id: string, old_page: PageData) => {
    const page = pages.get(page_id) ?? EMPTY_PAGE;

    if (JSON.stringify(page.row_data) !== JSON.stringify(old_page.row_data)) {
        cell_listeners.get(page_id)?.forEach((listener) => listener(page.row_data));
    }

    const settings = settings_of(page);
    if (JSON.stringify(settings) !== JSON.stringify(settings_of(old_page))) {
        settings_listeners.get(page_id)?.forEach((listener) => listener(settings));
    }
}

const subscribe = <Value>(listener_map: Map<string, Set<(value: Value) => void>>, page_id: string, listener: (value: Value) => void): (() => void) => {
    let listeners = listener_map.get(page_id);
    if (!listeners) {
        listeners = new Set();
        listener_map.set(page_id, listeners);
    }

    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

// --- writing ---

// one write at a time, so two quick edits can't both read the old state and the second undo the first
let write_queue: Promise<unknown> = Promise.resolve();

const queue_write = <Result>(write: () => Promise<Result>): Promise<Result> => {
    const result = write_queue.then(write);
    write_queue = result.catch(() => undefined);
    return result;
}

const save_manifest = async (new_manifest: PageManifest) => {
    await write_json_atomic(MANIFEST_PATH, new_manifest);
    manifest = new_manifest;
    notify_manifest();
}

const save_page = async (page_id: string, page: PageData) => {
    await write_json_atomic(await page_file_path(page_id), page);

    const old_page = pages.get(page_id) ?? EMPTY_PAGE;
    pages.set(page_id, page);
    notify_page(page_id, old_page);
}

/**
 * The name, or the name with the lowest number after it that no other page has, e.g. "New page 2".
 * Compared ignoring case, as "new page" and "New page" would look the same in the list.
 */
const unique_page_name = (name: string): string => {
    const taken = new Set(Object.values(manifest.names).map((existing) => existing.toLowerCase()));

    if (!taken.has(name.toLowerCase())) {
        return name;
    }

    let number = 2;
    while (taken.has(`${name} ${number}`.toLowerCase())) {
        number++;
    }

    return `${name} ${number}`;
}

/**
 * Adds an empty page after the others.
 * @returns the new page's id
 */
export const create_page = (name = NEW_PAGE_NAME): Promise<string> => queue_write(async () => {
    const page_id = crypto.randomUUID();

    // the file first, so the server never sees a page in the manifest without its file
    await save_page(page_id, EMPTY_PAGE);
    await save_manifest({...manifest, order: [...manifest.order, page_id], names: {...manifest.names, [page_id]: unique_page_name(name)}});

    return page_id;
});

/**
 * Copies a page and its cells, placing the copy straight after it.
 * @returns the copy's id
 */
export const duplicate_page = (source_id: string): Promise<string> => queue_write(async () => {
    const page_id = crypto.randomUUID();
    const order = [...manifest.order];
    order.splice(order.indexOf(source_id) + 1, 0, page_id);

    await save_page(page_id, structuredClone(pages.get(source_id) ?? EMPTY_PAGE));
    await save_manifest({...manifest, order, names: {...manifest.names, [page_id]: unique_page_name(`${manifest.names[source_id] ?? UNNAMED_PAGE_NAME} copy`)}});

    return page_id;
});

export const rename_page = (page_id: string, name: string): Promise<void> => queue_write(async () => {
    if (!manifest.order.includes(page_id)) {
        return;
    }

    await save_manifest({...manifest, names: {...manifest.names, [page_id]: name.trim() || UNNAMED_PAGE_NAME}});
});

export const set_home_page = (page_id: string): Promise<void> => queue_write(async () => {
    if (manifest.order.includes(page_id)) {
        await save_manifest({...manifest, home: page_id});
    }
});

/**
 * Moves a page to a new position in the order.
 */
export const move_page = (page_id: string, to_index: number): Promise<void> => queue_write(async () => {
    const order = manifest.order.filter((other_id) => other_id !== page_id);

    if (order.length === manifest.order.length) {
        return;
    }

    order.splice(Math.max(0, Math.min(to_index, order.length)), 0, page_id);
    await save_manifest({...manifest, order});
});

/**
 * Deletes a page and its file. Links to it do nothing afterwards, and devices showing it go home.
 * @throws if it's the home page, which always has to exist
 */
export const delete_page = (page_id: string): Promise<void> => queue_write(async () => {
    if (page_id === manifest.home) {
        throw new Error("The home page can't be deleted, make another page home first");
    }

    if (!manifest.order.includes(page_id)) {
        return;
    }

    const names = {...manifest.names};
    delete names[page_id];

    // the manifest first, so the server never sees a page in the manifest without its file
    await save_manifest({...manifest, order: manifest.order.filter((other_id) => other_id !== page_id), names});

    pages.delete(page_id);
    await remove(await page_file_path(page_id)).catch((error) => console.warn(`Couldn't remove page ${page_id}'s file:`, error));
});

export const set_grid_shape = (shape: GridShape): Promise<void> => queue_write(async () => {
    if (is_valid_shape(shape)) {
        await save_manifest({...manifest, shape});
    }
});

/**
 * Changes some of a page's settings, leaving the rest as they are.
 */
export const set_page_settings = (page_id: string, changes: Partial<PageSettings>): Promise<void> => queue_write(async () => {
    const page = pages.get(page_id);

    if (page) {
        await save_page(page_id, {...page, ...changes});
    }
});

export const set_grid_cell = (page_id: string, row_idx: number, col_idx: number, cell_data: CellData): Promise<void> => queue_write(async () => {
    const page = pages.get(page_id);

    if (!page) {
        return;
    }

    const cells = structuredClone(page.row_data);
    (cells[row_idx] ??= {})[col_idx] = cell_data;

    await save_page(page_id, {...page, row_data: cells});
});

export const delete_grid_cell = (page_id: string, row_idx: number, col_idx: number): Promise<void> => queue_write(async () => {
    const page = pages.get(page_id);

    if (!page?.row_data[row_idx]?.[col_idx]) {
        return;
    }

    const cells = structuredClone(page.row_data);

    delete cells[row_idx][col_idx];

    // drop the row entirely if it has no cells left, to keep the file tidy
    if (Object.keys(cells[row_idx]).length === 0) {
        delete cells[row_idx];
    }

    await save_page(page_id, {...page, row_data: cells});
});

// --- hooks ---

/**
 * The page manifest: which pages there are, in order, their names, which is home, and the grid's shape.
 */
export const usePageManifest = (): PageManifest => {
    const [value, setValue] = useState<PageManifest>(manifest);

    useEffect(() => {
        // it may have changed between the first render and subscribing
        setValue(manifest);

        manifest_listeners.add(setValue);
        return () => {
            manifest_listeners.delete(setValue);
        };
    }, []);

    return value;
}

/**
 * The grid's shape, shared by every page, and a setter for it.
 */
export const useGridShape = (): [GridShape, (shape: GridShape) => Promise<void>] => {
    return [usePageManifest().shape, set_grid_shape];
}

/**
 * One cell of a page, and a setter for it.
 * @returns undefined for an empty cell
 */
export const useGridCell = (page_id: string, row_idx: number, col_idx: number): [CellData | undefined, (cell_data: CellData) => Promise<void>] => {
    const [value, setValue] = useState<CellData | undefined>(() => pages.get(page_id)?.row_data[row_idx]?.[col_idx]);

    useEffect(() => {
        setValue(pages.get(page_id)?.row_data[row_idx]?.[col_idx]);

        return subscribe(cell_listeners, page_id, (cells) => {
            const new_cell = cells[row_idx]?.[col_idx];

            // deep comparison, so a write to another cell doesn't re-render this one
            setValue((previous) => JSON.stringify(previous) === JSON.stringify(new_cell) ? previous : new_cell);
        });
    }, [page_id, row_idx, col_idx]);

    const set_cell = useCallback(
        (cell_data: CellData) => set_grid_cell(page_id, row_idx, col_idx, cell_data),
        [page_id, row_idx, col_idx]
    );

    return [value, set_cell];
}

/**
 * A page's settings, and a setter that changes only the ones given.
 * @returns empty settings if there's no such page
 */
export const usePageSettings = (page_id: string): [PageSettings, (changes: Partial<PageSettings>) => Promise<void>] => {
    const [value, setValue] = useState<PageSettings>(() => settings_of(pages.get(page_id) ?? EMPTY_PAGE));

    useEffect(() => {
        setValue(settings_of(pages.get(page_id) ?? EMPTY_PAGE));
        return subscribe(settings_listeners, page_id, setValue);
    }, [page_id]);

    const update_settings = useCallback(
        (changes: Partial<PageSettings>) => set_page_settings(page_id, changes),
        [page_id]
    );

    return [value, update_settings];
}

// --- outside changes, e.g. pages.json edited by hand ---

const reload_manifest = async () => {
    const new_manifest = await read_manifest();

    // mid-write or broken, the next change brings it back
    if (!new_manifest || JSON.stringify(new_manifest) === JSON.stringify(manifest)) {
        return;
    }

    for (const page_id of new_manifest.order) {
        if (!pages.has(page_id)) {
            pages.set(page_id, await read_page(page_id) ?? EMPTY_PAGE);
        }
    }

    for (const page_id of [...pages.keys()]) {
        if (!new_manifest.order.includes(page_id)) {
            pages.delete(page_id);
        }
    }

    manifest = new_manifest;
    notify_manifest();
}

const reload_page = async (page_id: string) => {
    if (!pages.has(page_id)) {
        return;
    }

    const new_page = await read_page(page_id);
    const old_page = pages.get(page_id) ?? EMPTY_PAGE;

    if (!new_page) {
        return;
    }

    pages.set(page_id, new_page);
    notify_page(page_id, old_page);
}

// our own writes come back here too, and are skipped as nothing changed
await watch([data_dir, PAGES_DIR], (event) => {
    for (const changed_path of event.paths) {
        const file_name = changed_path.split(/[\\/]/).pop() ?? "";

        if (changed_path === MANIFEST_PATH) {
            void queue_write(reload_manifest);
            continue;
        }

        const match = /^(.+)\.json$/.exec(file_name);
        if (match && PAGE_ID_PATTERN.test(match[1]) && changed_path.startsWith(PAGES_DIR)) {
            const page_id = match[1];
            void queue_write(() => reload_page(page_id));
        }
    }
}, {delayMs: 100});
