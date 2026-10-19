import {ASSET_CONTENT_TYPES, ASSET_PATH_PATTERN, type AssetExtension} from "@pi-tray/types";

/**
 * What a logged in session needs to load assets: its id, which the server looks it up by, and its asset key.
 */
export interface AssetSession {
    id: string;
    key: CryptoKey;
}

/**
 * The server didn't recognise the session, e.g. it reconnected since. Loading again on the new session will work.
 */
export class StaleAssetSessionError extends Error {
    constructor() {
        super("The server doesn't recognise this session, load it again once reconnected");
        this.name = "StaleAssetSessionError";
    }
}

const NONCE_BYTES = 12;

// the nonce plus GCM's 16 byte tag, so anything shorter can't be a valid response
const MIN_BODY_BYTES = NONCE_BYTES + 16;

const DATABASE_NAME = "pi-tray-assets";
const STORE_NAME = "images";

interface ParsedAsset {
    /** Where to fetch it from, without the session */
    url: URL;

    /** <id>.<extension>, which is also the start of every cache key for this asset */
    file_name: string;

    extension: AssetExtension;
    version: string;

    /** <id>.<extension>?v=<version>, so a replaced image gets a new key */
    cache_key: string;
}

/**
 * Checks an asset path from the server (e.g. `/assets/<id>.png?v=123`) and resolves it against the server's address.<br>
 * Anything that would load from a different origin, or isn't an asset, is rejected.
 */
const parse_asset_path = (asset_path: string, socket_url: string): ParsedAsset | null => {
    // ws -> http and wss -> https
    const server_base = socket_url.replace(/^ws/, "http");

    let url: URL;
    try {
        url = new URL(asset_path, server_base);
        if (url.origin !== new URL(server_base).origin) {
            return null;
        }
    } catch {
        return null;
    }

    const path_match = url.pathname.match(ASSET_PATH_PATTERN);
    const version = url.searchParams.get("v");

    if (!path_match || !version) {
        return null;
    }

    const [, asset_id, extension] = path_match;
    const file_name = `${asset_id}.${extension}`;

    return {url, file_name, extension: extension as AssetExtension, version, cache_key: `${file_name}?v=${version}`};
}

const request_result = <Result>(request: IDBRequest<Result>): Promise<Result> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const transaction_done = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
});

// opened once. if storage isn't available this stays rejected, and every cache read or write is just skipped
let database: Promise<IDBDatabase> | null = null;

const open_database = (): Promise<IDBDatabase> => {
    database ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    return database;
}

const read_cached = async (cache_key: string): Promise<Blob | null> => {
    try {
        const store = (await open_database()).transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
        const cached = await request_result(store.get(cache_key));
        return cached instanceof Blob ? cached : null;
    } catch (error) {
        console.warn("Couldn't read the asset cache, loading from the server instead:", error);
        return null;
    }
}

// stores this version and drops any other version of the same asset, which can't be shown again
const write_cached = async (asset: ParsedAsset, image: Blob) => {
    try {
        const transaction = (await open_database()).transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        // every key for this asset starts with <id>.<extension>?
        const other_versions = await request_result(store.getAllKeys(IDBKeyRange.bound(`${asset.file_name}?`, `${asset.file_name}?\uffff`)));
        for (const key of other_versions) {
            if (key !== asset.cache_key) {
                store.delete(key);
            }
        }

        store.put(image, asset.cache_key);
        await transaction_done(transaction);
    } catch (error) {
        // still shown, it'll just be downloaded again next time
        console.warn("Couldn't save an asset to the cache:", error);
    }
}

const fetch_and_decrypt = async (asset: ParsedAsset, session: AssetSession): Promise<Blob | null> => {
    const url = new URL(asset.url);
    url.searchParams.set("s", session.id);

    const response = await fetch(url, {cache: "no-store"});

    if (response.status === 403) {
        throw new StaleAssetSessionError();
    }

    // missing, or replaced since this url was sent, in which case a cell with the new url follows
    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        throw new Error(`The server returned ${response.status} for ${asset.file_name}`);
    }

    const body = new Uint8Array(await response.arrayBuffer());
    if (body.length < MIN_BODY_BYTES) {
        throw new Error(`The server's response for ${asset.file_name} is too short to be an encrypted asset`);
    }

    // throws if it was tampered with, or is a different asset or version to the one asked for
    const plaintext = await crypto.subtle.decrypt(
        {name: "AES-GCM", iv: body.slice(0, NONCE_BYTES), additionalData: new TextEncoder().encode(`${asset.file_name}:${asset.version}`)},
        session.key,
        body.slice(NONCE_BYTES)
    );

    const image = new Blob([plaintext], {type: ASSET_CONTENT_TYPES[asset.extension]});
    await write_cached(asset, image);

    return image;
}

// so many buttons with the same image only download it once. keyed by session too, as a new session needs its own request
const in_flight = new Map<string, Promise<Blob | null>>();

/**
 * Loads an asset's image, from the cache if this version has been loaded before, otherwise from the server, decrypting it.<br>
 * Returns a Blob rather than an object url, so whoever shows it creates the url and revokes it when they're done.
 * @param asset_path the path from the server, e.g. `/assets/<id>.png?v=123`
 * @param socket_url the websocket's url, e.g. ws://192.168.50.1:31415, which the path is resolved against
 * @param session the logged in session to load it with
 * @returns the image, or null if the path isn't a valid asset or the server doesn't have this version
 * @throws StaleAssetSessionError if the server doesn't recognise the session, or another error if loading or decrypting failed
 */
export const load_asset = async (asset_path: string, socket_url: string, session: AssetSession): Promise<Blob | null> => {
    const asset = parse_asset_path(asset_path, socket_url);
    if (!asset) {
        return null;
    }

    const cached = await read_cached(asset.cache_key);
    if (cached) {
        return cached;
    }

    const request_key = `${session.id} ${asset.cache_key}`;

    let loading = in_flight.get(request_key);
    if (!loading) {
        loading = fetch_and_decrypt(asset, session).finally(() => in_flight.delete(request_key));
        in_flight.set(request_key, loading);
    }

    return loading;
}
