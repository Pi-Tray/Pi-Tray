import {exists, writeTextFile, readTextFile, watch} from "@tauri-apps/plugin-fs";
import { join, dataDir } from "@tauri-apps/api/path";

import { useEffect, useState } from "react";

const appdata = await dataDir();
const CONFIG_FILE = await join(appdata, "pi-tray", "editor.json");

// explicitly declare something as undefined here is you don't want to set a default value
// we are using the keys of defaults as types for the config getters and setters so it needs to be declared here
const DEFAULTS = {
    devtools: false,
    ws_url: null,
    dont_overwrite_ws_url: false, // TODO: this causes a lot of double negatives i.e. !dont_overwrite_ws_url, should it be renamed and inverted?
};

export type ConfigKey = keyof typeof DEFAULTS;

// write the default config file if it does not exist
if (!await exists(CONFIG_FILE)) {
    await writeTextFile(CONFIG_FILE, JSON.stringify(DEFAULTS, null, 4));
}

const change_listeners: Partial<Record<ConfigKey, ((value: any) => void)[]>> = {};

/**
 * Subscribe to changes in a configuration value.
 * @param key the key of the configuration value to subscribe to
 * @param callback the callback to call when the configuration value changes
 */
export const subscribe_to_config_change = (key: ConfigKey, callback: (value: any) => void): void => {
    if (!change_listeners[key]) {
        change_listeners[key] = [];
    }

    change_listeners[key].push(callback);
}

/**
 * Unsubscribe from changes in a configuration value.
 * @param key the key of the configuration value to unsubscribe from
 * @param callback a reference equivalent to the callback passed to `subscribe_to_config_change`
 */
export const unsubscribe_from_config_change = (key: ConfigKey, callback: (value: any) => void): void => {
    if (change_listeners[key]) {
        // filter out the callback from the listeners
        change_listeners[key] = change_listeners[key].filter(cb => cb !== callback);
    }
}

const notify_config_change = (key: ConfigKey, value: any): void => {
    if (change_listeners[key]) {
        change_listeners[key].forEach(callback => callback(value));
    }
}


/**
 * Get a configuration value from the config file, or the default value if it does not exist.
 * @param key the key of the configuration value to get
 * @returns the value of the configuration key, or the default value if it does not exist
 */
export const get_config = async (key: ConfigKey): Promise<any> => {
    if (!await exists(CONFIG_FILE)) {
        // write default config and return the default value
        await writeTextFile(CONFIG_FILE, JSON.stringify(DEFAULTS, null, 4));
        return DEFAULTS[key];
    }

    const config = JSON.parse(await readTextFile(CONFIG_FILE));
    if (key in config) {
        return config[key];
    } else {
        // if the key does not exist for some reason, return the default value
        return DEFAULTS[key];
    }
}

/**
 * Set a configuration value in the config file.
 * @param key the key of the configuration value to set
 * @param value the value to set
 */
export const set_config = async (key: ConfigKey, value: any): Promise<void> => {
    let config: Record<string, any>;

    if (await exists(CONFIG_FILE)) {
        config = JSON.parse(await readTextFile(CONFIG_FILE));
    } else {
        config = DEFAULTS;
    }

    config[key] = value;
    await writeTextFile(CONFIG_FILE, JSON.stringify(config, null, 4));

    notify_config_change(key, value);
}

/**
 * A React hook to get and set a configuration value.<br>
 * It will automatically subscribe to changes to the configuration value and update the state when it changes.
 * @param key the key of the configuration value to get and set
 * @return a tuple containing the current value and a function to set the value
 */
export const useConfigValue = (key: ConfigKey): [any, (value: any) => Promise<void>] => {
    const [value, setValue] = useState<any>(DEFAULTS[key]);

    useEffect(() => {
        // set initial value on mount
        get_config(key).then(initial_value => {
            setValue(initial_value);
        });

        // create a fixed callback to allow for cleanup
        const callback = (new_value: any) => {
            setValue(new_value);
        };

        subscribe_to_config_change(key, callback);

        return () => {
            // cleanup the subscription on unmount
            unsubscribe_from_config_change(key, callback);
        };
    }, [key]);

    // create setter wrapper
    const setKeyValue = async (newValue: any) => {
        await set_config(key, newValue);
    };

    return [value, setKeyValue];
}

// load the config file into a last known state
// TODO: convert this so that it's a cache for get_config
let last_config: Record<string, any> = {};
if (await exists(CONFIG_FILE)) {
    last_config = JSON.parse(await readTextFile(CONFIG_FILE));
}

// watch for changes to the config file and update the state accordingly, calling set_config if the value changes for a key
await watch(CONFIG_FILE, async (event) => {
    if (typeof event.type === "object" && "modify" in event.type) {
        const new_config = JSON.parse(await readTextFile(CONFIG_FILE));

        // check for changes in the config file
        for (const key in new_config) {
            if (new_config[key] !== last_config[key]) {
                // if the value has changed, notify listeners
                notify_config_change(key as ConfigKey, new_config[key]);
            }
        }

        // update the last known state
        last_config = new_config;
    }
});
