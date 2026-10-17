import {find_plugin_problems, Plugin} from "./types";

import fs from "fs";
import path from "path";
import {createRequire} from "module";
import {in_plugin_dir, plugin_dir} from "@pi-tray/paths";

import {package_folder, split_plugin_reference} from "./package_location";

// plain node's require, rather than the bundle's, which esbuild and pkg wrap. only ever given absolute paths
const require_plugin = createRequire(plugin_dir + path.sep);

// validated plugins, keyed by their full name e.g. @pi-tray/builtin/run_command
const loaded_plugins = new Map<string, Plugin>();

// every require cache entry that was created while loading a plugin, including the plugin's own dependencies,
// so clearing the cache also catches dependencies that resolve outside the plugin's folder
const plugin_module_paths = new Set<string>();

const cache_clear_listeners = new Set<() => void>();

/**
 * Calls the listener just before the plugin cache is cleared, e.g. so running live tiles can be stopped.
 * @param listener the listener to add
 * @returns a function that removes the listener
 */
export const add_plugin_cache_clear_listener = (listener: () => void): (() => void) => {
    cache_clear_listeners.add(listener);
    return () => {
        cache_clear_listeners.delete(listener);
    };
}

/**
 * Forgets every loaded plugin and removes their modules from the require cache.<br>
 * The next {@link load_plugin} call for each plugin will load it fresh from disk, re-running its top level code.
 */
export const clear_plugin_cache = () => {
    for (const listener of cache_clear_listeners) {
        try {
            listener();
        } catch (error) {
            console.error("Error in plugin cache clear listener:", error);
        }
    }

    loaded_plugins.clear();

    for (const module_path of plugin_module_paths) {
        delete require_plugin.cache[module_path];
    }

    plugin_module_paths.clear();
}

/**
 * Loads a plugin and validates its structure, or returns the already loaded copy.<br>
 * The plugin's folder (e.g. <plugin dir>/@pi-tray/builtin/run_command) must export a plugin object as its default export.<br>
 * Plugins stay loaded until {@link clear_plugin_cache} is called, which happens automatically when installed.json changes.
 * @param name the plugin's full name, e.g. @pi-tray/builtin/run_command
 * @return the loaded plugin object
 */
export const load_plugin = (name: string) => {
    const cached_plugin = loaded_plugins.get(name);
    if (cached_plugin) {
        return cached_plugin;
    }

    // throws for a name that isn't a plugin reference, so it can never point outside plugin_dir
    const {package_name, plugin_name} = split_plugin_reference(name);

    // remember what was already cached so we can tell which modules this plugin pulled in
    const cache_before_load = new Set(Object.keys(require_plugin.cache));

    const module = require_plugin(path.join(package_folder(package_name), plugin_name));

    for (const module_path of Object.keys(require_plugin.cache)) {
        if (!cache_before_load.has(module_path)) {
            plugin_module_paths.add(module_path);
        }
    }

    if (!module || typeof module !== "object" || !module.default) {
        throw new Error(`Plugin ${name} does not export a valid plugin object as default.`);
    }

    const plugin = module.default;
    const problems = find_plugin_problems(plugin);

    if (problems.length > 0) {
        throw new Error(`Plugin ${name} isn't valid: ${problems.join("; ")}`);
    }

    loaded_plugins.set(name, plugin as Plugin);
    return plugin as Plugin;
}

// installing, removing or updating a package changes installed.json, so drop every loaded plugin when it does
const installed_registry = in_plugin_dir("installed.json");

fs.watchFile(installed_registry, {interval: 1000}, () => {
    console.log("installed.json changed, clearing plugin cache.");
    clear_plugin_cache();
});
