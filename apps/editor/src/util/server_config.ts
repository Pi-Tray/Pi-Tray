import {exists, readTextFile, writeTextFile} from "@tauri-apps/plugin-fs";

import {default_server_config, parse_server_config, ParsedServerConfig, SERVER_CONFIG_FILE, ServerConfig} from "@pi-tray/server-config";

import {in_data_dir} from "./paths";

// the same file the server reads at startup, so changes apply the next time it starts
const config_path = await in_data_dir(SERVER_CONFIG_FILE);

/**
 * Reads the server's settings, with defaults for anything missing or invalid, and why anything was ignored.
 * A missing file gives the defaults, as the server does.
 */
export const load_server_config = async (): Promise<ParsedServerConfig> => {
    if (!await exists(config_path)) {
        return {config: default_server_config(), problems: []};
    }

    return parse_server_config(await readTextFile(config_path));
}

/**
 * Writes the server's settings. The server only reads them when it starts, so it needs restarting to use them.
 */
export const save_server_config = async (config: ServerConfig): Promise<void> => {
    // the same layout the server writes the defaults in
    await writeTextFile(config_path, JSON.stringify(config, null, 4));
}
