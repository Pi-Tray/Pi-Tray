import type {IncomingMessage, ServerResponse} from "http";

import fs from "fs";
import path from "path";

import {in_data_dir} from "@pi-tray/paths";
import {ASSET_FILE_PATTERN, ASSET_ID_PATTERN, ASSET_PATH_PATTERN, AssetExtension} from "./types";
import {find_client} from "./clients";

export const assets_dir = in_data_dir("assets");
fs.mkdirSync(assets_dir, {recursive: true});


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

// the client fetches assets from a file:// page, so every response, errors included, has to be readable cross-origin
const CORS_HEADERS = {"Access-Control-Allow-Origin": "*"};

const NONCE_BYTES = 12;

const send_status = (response: ServerResponse, status_code: number, headers: Record<string, string> = {}) => {
    response.writeHead(status_code, {...CORS_HEADERS, ...headers});
    response.end();
}

const text_encoder = new TextEncoder();

const serve_asset = async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "GET") {
        send_status(response, 405, {Allow: "GET"});
        return;
    }

    // parse rather than slicing the raw url, the base is only needed because request.url is relative
    const url = new URL(request.url ?? "/", "http://localhost");
    const version = url.searchParams.get("v");
    const session_id = url.searchParams.get("s");

    if (!version || !session_id) {
        send_status(response, 400);
        return;
    }

    // checked before the file, so nothing about which assets exist is given away to anyone not logged in
    const client = find_client(session_id);
    if (!client) {
        send_status(response, 403);
        return;
    }

    const path_match = url.pathname.match(ASSET_PATH_PATTERN);
    if (!path_match) {
        send_status(response, 404);
        return;
    }

    const [, asset_id, extension] = path_match;
    const file_name = `${asset_id}.${extension}`;
    const file_path = path.join(assets_dir, file_name);

    // the file's current version, the same way resolve_asset_url works it out, or null if it isn't there
    const current_version = async (): Promise<string | null> => {
        try {
            const stats = await fs.promises.stat(file_path);
            return stats.isFile() ? String(Math.floor(stats.mtimeMs)) : null;
        } catch {
            return null;
        }
    };

    // an old url gets a 404 rather than the new image, which would otherwise be cached under the old version
    if (await current_version() !== version) {
        send_status(response, 404);
        return;
    }

    let contents: Buffer;
    try {
        contents = await fs.promises.readFile(file_path);
    } catch {
        send_status(response, 404);
        return;
    }

    // replaced while it was being read, so what was read may not be this version
    if (await current_version() !== version) {
        send_status(response, 404);
        return;
    }

    // tied to this asset and version, so one response can't be passed off as another
    const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
    const ciphertext = await crypto.subtle.encrypt(
        {name: "AES-GCM", iv: nonce, additionalData: text_encoder.encode(`${file_name}:${version}`)},
        client.asset_key,
        // a copy, as webcrypto wants memory that can't be shared, which node's pooled buffers might be
        new Uint8Array(contents)
    );

    const body = Buffer.concat([nonce, new Uint8Array(ciphertext)]);

    response.writeHead(200, {
        ...CORS_HEADERS,
        // the real type comes from the extension once the client has decrypted it
        "Content-Type": "application/octet-stream",
        "Content-Length": body.length,
        // only this session can decrypt it, and the client caches the decrypted image itself
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    response.end(body);
}

/**
 * HTTP handler that serves files from the assets folder, and nothing else, encrypted for the session asking.<br>
 * Only `/assets/<uuid>.<image extension>?v=<version>&s=<session id>` is accepted:
 * - `v`: the version from {@link resolve_asset_url}, which has to be the file's current one
 * - `s`: the id of the logged in session asking, whose asset key the response is encrypted with
 *
 * The body is a 12 byte nonce then the AES-256-GCM ciphertext, with `<uuid>.<extension>:<version>` as the associated data.<br>
 * 400 for a missing parameter, 403 for a session that isn't logged in (e.g. it reconnected), 404 for a missing or old asset.
 * @param request the incoming request
 * @param response the response to write to
 */
export const handle_asset_request = (request: IncomingMessage, response: ServerResponse) => {
    serve_asset(request, response).catch((error) => {
        console.error("Failed to serve an asset:", error);

        if (response.headersSent) {
            response.destroy();
        } else {
            send_status(response, 500);
        }
    });
}
