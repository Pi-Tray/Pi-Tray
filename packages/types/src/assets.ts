// shared by the server, which serves assets, and the editor, which creates them, so both always agree on what's valid

/**
 * Image types assets can be.
 */
export const ASSET_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"] as const;

export type AssetExtension = typeof ASSET_EXTENSIONS[number];

export const ASSET_CONTENT_TYPES: Record<AssetExtension, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
};

// lowercase only, as crypto.randomUUID() produces, so nothing else can ever be mistaken for an asset
const ASSET_ID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ASSET_EXTENSION_SOURCE = ASSET_EXTENSIONS.join("|");

/**
 * An asset id on its own, e.g. from a cell in grid.json.
 */
export const ASSET_ID_PATTERN = new RegExp(`^${ASSET_ID_SOURCE}$`);

/**
 * An asset's image file name, capturing the id and extension, e.g. `<id>.png`
 */
export const ASSET_FILE_PATTERN = new RegExp(`^(${ASSET_ID_SOURCE})\\.(${ASSET_EXTENSION_SOURCE})$`);

/**
 * The path the server serves an asset at, capturing the id and extension, e.g. `/assets/<id>.png`. Query strings aren't included.
 */
export const ASSET_PATH_PATTERN = new RegExp(`^/assets/(${ASSET_ID_SOURCE})\\.(${ASSET_EXTENSION_SOURCE})$`);
