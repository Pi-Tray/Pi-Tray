import type {IncomingMessage, ServerResponse} from "http";

import fs from "fs";
import path from "path";

import {in_data_dir} from "./data";

export const assets_dir = in_data_dir("assets");
fs.mkdirSync(assets_dir, {recursive: true});

const CONTENT_TYPES: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
};

// a lowercase uuid with an allowed image extension, so nothing else in the data dir can ever be requested
const ASSET_PATH_PATTERN = /^\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpe?g|webp|gif|svg)$/;

// just the id part, for validating ids that come from grid.json before touching the filesystem
const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// matches asset image files in the folder, capturing the id
const ASSET_FILE_PATTERN = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(png|jpe?g|webp|gif|svg)$/;

/**
 * Turns an asset id into the url clients should load it from, e.g. `/assets/<id>.png?v=<mtime>`.<br>
 * The url is relative, clients resolve it against the address they connected to.
 * @param asset_id the asset's id, typically from a cell in grid.json
 * @returns the url, or null if there's no such asset
 */
export const resolve_asset_url = (asset_id: string | undefined): string | null => {
    if (!asset_id || !ASSET_ID_PATTERN.test(asset_id)) {
        return null;
    }

    let newest: { file_name: string, version: number } | null = null;

    // newest file wins if a replace has briefly left two images for one id
    for (const file_name of fs.readdirSync(assets_dir)) {
        if (!file_name.startsWith(`${asset_id}.`) || !ASSET_FILE_PATTERN.test(file_name)) {
            continue;
        }

        const version = Math.floor(fs.statSync(path.join(assets_dir, file_name)).mtimeMs);
        if (!newest || version > newest.version) {
            newest = {file_name, version};
        }
    }

    return newest ? `/assets/${newest.file_name}?v=${newest.version}` : null;
}

export type AssetChangeListener = (asset_id: string) => void;

const asset_change_listeners = new Set<AssetChangeListener>();

/**
 * Calls the listener with an asset's id whenever its image is added, replaced or deleted.
 * @param listener the listener to add
 * @returns a function that removes the listener
 */
export const add_asset_change_listener = (listener: AssetChangeListener): (() => void) => {
    asset_change_listeners.add(listener);
    return () => {
        asset_change_listeners.delete(listener);
    };
}

// a single write fires several watch events, so changes to each asset are batched briefly
const pending_asset_changes = new Map<string, NodeJS.Timeout>();

fs.watch(assets_dir, (_event_type, file_name) => {
    const file_match = file_name ? String(file_name).match(ASSET_FILE_PATTERN) : null;
    if (!file_match) {
        // the name sidecars don't affect what clients see
        return;
    }

    const asset_id = file_match[1];

    clearTimeout(pending_asset_changes.get(asset_id));
    pending_asset_changes.set(asset_id, setTimeout(() => {
        pending_asset_changes.delete(asset_id);
        console.log(`Asset ${asset_id} changed, notifying listeners`);
        asset_change_listeners.forEach(listener => listener(asset_id));
    }, 250));
});

const send_status = (response: ServerResponse, status_code: number, headers: Record<string, string> = {}) => {
    response.writeHead(status_code, headers);
    response.end();
}

/**
 * HTTP handler that serves files from the assets folder, and nothing else.<br>
 * Only `/assets/<uuid>.<image extension>` is accepted, any query string (e.g. `?v=` for cache busting) is ignored.
 * @param request the incoming request
 * @param response the response to write to
 */
export const handle_asset_request = (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
        send_status(response, 405, {Allow: "GET, HEAD"});
        return;
    }

    // parse rather than slicing the raw url, the base is only needed because request.url is relative
    const url_path = new URL(request.url ?? "/", "http://localhost").pathname;
    const path_match = url_path.match(ASSET_PATH_PATTERN);

    if (!path_match) {
        send_status(response, 404);
        return;
    }

    const [, asset_id, extension] = path_match;
    const file_path = path.join(assets_dir, `${asset_id}.${extension}`);

    fs.stat(file_path, (stat_error, stats) => {
        if (stat_error || !stats.isFile()) {
            send_status(response, 404);
            return;
        }

        response.writeHead(200, {
            "Content-Type": CONTENT_TYPES[extension],
            "Content-Length": stats.size,
            // urls carry ?v=<mtime>, so a replaced file gets a new url and this can be cached forever
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            // svgs can contain scripts, this stops them running if an asset url is ever opened directly rather than via <img>
            "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        });

        if (request.method === "HEAD") {
            response.end();
            return;
        }

        fs.createReadStream(file_path)
            .on("error", () => response.destroy())
            .pipe(response);
    });
}
