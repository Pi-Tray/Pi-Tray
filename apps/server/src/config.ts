import fs from "fs";

import {default_server_config, parse_server_config, SERVER_CONFIG_FILE, ServerConfig} from "@pi-tray/server-config";

import {data_dir, in_data_dir} from "@pi-tray/paths";

const config_path = in_data_dir(SERVER_CONFIG_FILE);

/**
 * Loads the server config from the data folder, creating it with the defaults if it doesn't exist yet.<br>
 * Never throws: anything missing or invalid falls back to its default, with the reason logged.
 */
export const load_server_config = (): ServerConfig => {
    if (!fs.existsSync(config_path)) {
        const default_config = default_server_config();

        try {
            fs.mkdirSync(data_dir, {recursive: true});
            fs.writeFileSync(config_path, JSON.stringify(default_config, null, 4));
            console.log(`Created ${config_path} with the default settings`);
        } catch (error) {
            console.error(`Couldn't create ${config_path}, using the default settings:`, error);
        }

        return default_config;
    }

    let text: string;
    try {
        text = fs.readFileSync(config_path, "utf8");
    } catch (error) {
        console.error(`Couldn't read ${config_path}, using the default settings:`, error);
        return default_server_config();
    }

    const {config, problems} = parse_server_config(text);

    for (const problem of problems) {
        console.warn(`${SERVER_CONFIG_FILE}: ${problem}`);
    }

    return config;
}
