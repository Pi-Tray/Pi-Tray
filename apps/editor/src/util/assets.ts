import {useSyncExternalStore} from "react";

import {exists, mkdir, readDir, readFile, readTextFile, remove, stat, watch, writeFile, writeTextFile} from "@tauri-apps/plugin-fs";
import {dataDir, join} from "@tauri-apps/api/path";

export const ASSET_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"];
export const ASSET_ACCEPT = ASSET_EXTENSIONS.map(extension => `.${extension}`).join(",");

// stops a huge file being added by accident, every client downloads each asset it shows
export const MAX_ASSET_BYTES = 10 * 1024 * 1024;

// same as the server's pattern, so the editor never writes a file the server would refuse to serve
const ASSET_FILE_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpe?g|webp|gif|svg)$/;

const appdata = await dataDir();
const assets_dir = await join(appdata, "pi-tray", "assets");

export interface Asset {
    /**
     * Stable id that cells reference, never changes even if the file or name does.
     */
    id: string;

    name: string;

    /**
     * The image file in the assets folder, e.g. `<id>.png`
     */
    file_name: string;

    extension: string;

    /**
     * The file's modified time in ms, changes whenever the image is replaced.
     */
    version: number;

    /**
     * A blob url of the image, so the editor can show previews without the server running.
     */
    preview_url: string;
}

interface AssetMeta {
    name: string;
}

/**
 * Gets the lowercase extension of a file name, or an empty string if it has none.
 */
const extension_of = (file_name: string) => {
    const dot_idx = file_name.lastIndexOf(".");
    return dot_idx === -1 ? "" : file_name.slice(dot_idx + 1).toLowerCase();
}

/**
 * Gets a file name without its extension, used as the default name for new assets.
 */
const name_without_extension = (file_name: string) => {
    const dot_idx = file_name.lastIndexOf(".");
    return dot_idx <= 0 ? file_name : file_name.slice(0, dot_idx);
}

/**
 * Throws if a file can't be used as an asset.
 * @returns the file's validated extension
 */
const validate_asset_file = (file: File): string => {
    const extension = extension_of(file.name);

    if (!ASSET_EXTENSIONS.includes(extension)) {
        throw new Error(`Unsupported file type ".${extension}", expected one of: ${ASSET_EXTENSIONS.join(", ")}`);
    }

    if (file.size > MAX_ASSET_BYTES) {
        throw new Error(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB), the limit is ${MAX_ASSET_BYTES / 1024 / 1024} MB`);
    }

    return extension;
}

const meta_path = (asset_id: string) => join(assets_dir, `${asset_id}.json`);

const write_meta = async (asset_id: string, meta: AssetMeta) => {
    await writeTextFile(await meta_path(asset_id), JSON.stringify(meta, null, 4));
}

const read_meta = async (asset_id: string): Promise<AssetMeta | null> => {
    try {
        return JSON.parse(await readTextFile(await meta_path(asset_id)));
    } catch {
        return null;
    }
}

/**
 * Lists the image files belonging to an asset. Normally one, but a replace briefly leaves the old one too.
 */
const list_asset_image_files = async (asset_id: string): Promise<string[]> => {
    const entries = await readDir(assets_dir);

    return entries
        .filter(entry => entry.isFile && ASSET_FILE_PATTERN.test(entry.name) && entry.name.startsWith(`${asset_id}.`))
        .map(entry => entry.name);
}


// null until the first load finishes
let current_assets: Asset[] | null = null;

const store_listeners = new Set<() => void>();

// blob urls by asset id, reused while the version is unchanged so previews don't reload on every refresh
const preview_cache = new Map<string, { version: number, url: string }>();

const load_assets = async (): Promise<Asset[]> => {
    const entries = await readDir(assets_dir);

    // newest file wins if an asset somehow has two images
    const newest_by_id = new Map<string, { file_name: string, extension: string, version: number }>();

    for (const entry of entries) {
        const file_match = entry.isFile ? entry.name.match(ASSET_FILE_PATTERN) : null;
        if (!file_match) {
            continue;
        }

        const [, asset_id, extension] = file_match;
        const file_info = await stat(await join(assets_dir, entry.name));
        const version = file_info.mtime?.getTime() ?? 0;

        const existing = newest_by_id.get(asset_id);
        if (!existing || version > existing.version) {
            newest_by_id.set(asset_id, {file_name: entry.name, extension, version});
        }
    }

    const loaded_assets: Asset[] = [];

    for (const [asset_id, image] of newest_by_id) {
        let cached_preview = preview_cache.get(asset_id);

        if (!cached_preview || cached_preview.version !== image.version) {
            if (cached_preview) {
                URL.revokeObjectURL(cached_preview.url);
            }

            const bytes = await readFile(await join(assets_dir, image.file_name));
            const mime_type = image.extension === "svg" ? "image/svg+xml" : `image/${image.extension === "jpg" ? "jpeg" : image.extension}`;

            cached_preview = {version: image.version, url: URL.createObjectURL(new Blob([bytes], {type: mime_type}))};
            preview_cache.set(asset_id, cached_preview);
        }

        const meta = await read_meta(asset_id);

        loaded_assets.push({
            id: asset_id,
            name: meta?.name || "Untitled",
            file_name: image.file_name,
            extension: image.extension,
            version: image.version,
            preview_url: cached_preview.url,
        });
    }

    // free previews for assets that no longer exist
    for (const [asset_id, cached_preview] of preview_cache) {
        if (!newest_by_id.has(asset_id)) {
            URL.revokeObjectURL(cached_preview.url);
            preview_cache.delete(asset_id);
        }
    }

    return loaded_assets.sort((first, second) => first.name.localeCompare(second.name));
}

let refresh_running = false;
let refresh_queued = false;

/**
 * Re-reads the assets folder and notifies every {@link useAssets} hook.<br>
 * Called automatically by the folder watcher and after every change made through this module.
 * Overlapping calls are merged so a burst of file events only causes one extra reload.
 */
export const refresh_assets = async () => {
    if (refresh_running) {
        refresh_queued = true;
        return;
    }

    refresh_running = true;

    try {
        do {
            refresh_queued = false;

            try {
                current_assets = await load_assets();
                store_listeners.forEach(listener => listener());
            } catch (error) {
                console.error("Failed to load assets:", error);
            }
        } while (refresh_queued);
    } finally {
        refresh_running = false;
    }
}

const subscribe_to_assets = (listener: () => void) => {
    store_listeners.add(listener);
    return () => {
        store_listeners.delete(listener);
    };
}

const get_assets_snapshot = () => current_assets;

/**
 * A React hook that provides every asset, sorted by name, and updates whenever the assets folder changes.
 * @returns the assets, or null until they've first loaded
 */
export const useAssets = (): Asset[] | null => {
    return useSyncExternalStore(subscribe_to_assets, get_assets_snapshot);
}

/**
 * A React hook that provides a single asset.
 * @param asset_id the asset's id, or null/undefined for none
 * @returns the asset, or null if it doesn't exist (or assets haven't loaded yet)
 */
export const useAsset = (asset_id: string | null | undefined): Asset | null => {
    const assets = useAssets();
    return (asset_id && assets?.find(asset => asset.id === asset_id)) || null;
}

/**
 * Adds a new asset from a file, e.g. from an `<input type="file">`.
 * @param file the image file
 * @param name display name, defaults to the file name without its extension
 * @returns the new asset's id, to store on a cell
 */
export const create_asset = async (file: File, name: string = name_without_extension(file.name)): Promise<string> => {
    const extension = validate_asset_file(file);
    const asset_id = crypto.randomUUID();

    // name first, so the image never shows up as Untitled
    await write_meta(asset_id, {name});
    await writeFile(await join(assets_dir, `${asset_id}.${extension}`), new Uint8Array(await file.arrayBuffer()));

    await refresh_assets();
    return asset_id;
}

/**
 * Replaces an asset's image, keeping its id and name so cells using it update automatically.
 * @param asset_id the asset to replace
 * @param file the new image file, may be a different type to the old one
 */
export const replace_asset = async (asset_id: string, file: File) => {
    const extension = validate_asset_file(file);
    const new_file_name = `${asset_id}.${extension}`;

    // written rather than copied, so the file gets a fresh modified time and therefore a new cache-busting version
    await writeFile(await join(assets_dir, new_file_name), new Uint8Array(await file.arrayBuffer()));

    // remove the old image if the type changed, after writing the new one so the asset never has no image
    for (const old_file_name of await list_asset_image_files(asset_id)) {
        if (old_file_name !== new_file_name) {
            await remove(await join(assets_dir, old_file_name));
        }
    }

    await refresh_assets();
}

/**
 * Changes an asset's display name.
 * @param asset_id the asset to rename
 * @param name the new name
 */
export const rename_asset = async (asset_id: string, name: string) => {
    await write_meta(asset_id, {name});
    await refresh_assets();
}

/**
 * Deletes an asset's image and name.<br>
 * Doesn't check whether any cells use it, so check that before calling.
 * @param asset_id the asset to delete
 */
export const delete_asset = async (asset_id: string) => {
    for (const file_name of await list_asset_image_files(asset_id)) {
        await remove(await join(assets_dir, file_name));
    }

    if (await exists(await meta_path(asset_id))) {
        await remove(await meta_path(asset_id));
    }

    await refresh_assets();
}


// watching a missing folder fails, and the server may not have run yet to create it
if (!await exists(assets_dir)) {
    await mkdir(assets_dir, {recursive: true});
}

// catches changes made outside this module too, e.g. files added by hand
await watch(assets_dir, () => refresh_assets());

refresh_assets();
