import path from "path";

// kept free of side effects (no folders created here), so anything can import it early, e.g. the server's logging
// the editor's webview can't use node's path module, so it works these out through tauri in its own util/paths.ts

// thanks https://stackoverflow.com/a/26227660/19678893
export const appdata_root = process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Application Support" : process.env.HOME + "/.config");

/**
 * A path inside the platform's app data folder, e.g. %APPDATA% on Windows.
 */
export const in_appdata = (...segments: string[]): string => path.join(appdata_root, ...segments);

export const data_dir = in_appdata("pi-tray");

/**
 * A path inside Pi-Tray's data folder, e.g. in_data_dir("grid.json").
 */
export const in_data_dir = (...segments: string[]): string => path.join(data_dir, ...segments);

/**
 * Where plugins are installed.
 */
export const plugin_dir = in_data_dir("plugins");

export const in_plugin_dir = (...segments: string[]): string => path.join(plugin_dir, ...segments);

/**
 * Where plugins (are meant to) store their data.
 */
export const plugin_data_dir = in_data_dir("plugin-data");

export const in_plugin_data_dir = (...segments: string[]): string => path.join(plugin_data_dir, ...segments);
