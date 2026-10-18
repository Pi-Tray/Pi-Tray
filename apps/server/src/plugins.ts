import {find_plugin_problems, Plugin} from "./types";

import fs from "fs";
import path from "path";
import {createRequire} from "module";
import {plugin_dir} from "@pi-tray/paths";

import {installed_file, InstalledRegistry, package_folder, read_installed} from "@pi-tray/installer/read";
import {split_plugin_reference} from "@pi-tray/package-spec";

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

// what's installed, re-read whenever the package manager changes it, so a folder it didn't install is never loaded
let installed_packages: InstalledRegistry["packages"] | null = null;

const get_installed_packages = (): InstalledRegistry["packages"] => {
    installed_packages ??= read_installed().packages;
    return installed_packages;
}

/**
 * Loads a plugin and validates its structure, or returns the already loaded copy.<br>
 * The plugin's folder (e.g. <plugin dir>/@pi-tray/builtin/run_command) must export a plugin object as its default export.<br>
 * Plugins stay loaded until {@link clear_plugin_cache} is called, which happens automatically when a package is installed or removed.
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

    if (!get_installed_packages()[package_name]) {
        throw new Error(`${package_name} isn't installed, install it with the package manager before loading its plugins.`);
    }

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

// installing, removing or updating a package changes the registry, so drop every loaded plugin when it does
fs.watchFile(installed_file, {interval: 1000}, () => {
    console.log("Installed packages changed, clearing plugin cache.");
    installed_packages = null;
    clear_plugin_cache();
});
