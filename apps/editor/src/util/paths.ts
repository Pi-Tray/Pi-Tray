import {dataDir, join} from "@tauri-apps/api/path";

// the editor's copy of @pi-tray/paths: the webview can't use node's path module, so this goes through tauri
// keep the folder names in step with packages/paths

export const data_dir = await join(await dataDir(), "pi-tray");

/**
 * A path inside Pi-Tray's data folder, e.g. await in_data_dir("grid.json").
 */
export const in_data_dir = (...segments: string[]): Promise<string> => join(data_dir, ...segments);

/**
 * Where plugins are installed.
 */
export const plugin_dir = await in_data_dir("plugins");

export const in_plugin_dir = (...segments: string[]): Promise<string> => join(plugin_dir, ...segments);
