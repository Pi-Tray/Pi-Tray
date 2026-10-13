import {Plugin, PLUGIN_LIVE_CONTROLLABLE, PluginLiveControllable} from "./types";

import fs from "fs";
import {createRequire} from "module";
import {in_plugin_env} from "./data";

// create a custom require resolver that looks at the node_modules of the plugin-env directory
const require_from_plugin_env = createRequire(in_plugin_env("package.json"));

// validated plugins, keyed by their full name e.g. @pi-tray/builtin/run_command
const loaded_plugins = new Map<string, Plugin>();

// every require cache entry that was created while loading a plugin, including the plugin's own dependencies
// tracked this way rather than by path so that symlinked (npm link) plugins outside plugin-env are cleared too
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
        delete require_from_plugin_env.cache[module_path];
    }

    plugin_module_paths.clear();
}

// fails to compile if a controllable field is added to the type but not to the list above
type MissingLiveControllable = Exclude<PluginLiveControllable, typeof PLUGIN_LIVE_CONTROLLABLE[number]>;
const live_controllable_fields_complete: [MissingLiveControllable] extends [never] ? true : never = true;
void live_controllable_fields_complete;

/**
 * Checks a module's default export looks like a plugin.
 * @param plugin the default export
 * @returns every problem found, empty if it's valid
 */
const find_plugin_problems = (plugin: any): string[] => {
    const problems: string[] = [];

    if (!plugin || typeof plugin !== "object") {
        return ["the default export isn't an object"];
    }

    if (plugin.handle_push !== undefined && typeof plugin.handle_push !== "function") {
        problems.push("handle_push must be a function");
    }

    if (plugin.live !== undefined) {
        const live = plugin.live;

        if (!live || typeof live !== "object") {
            problems.push("live must be an object");
        } else {
            if (typeof live.init !== "function") {
                problems.push("live.init must be a function");
            }

            if (!Array.isArray(live.controls) || live.controls.length === 0) {
                problems.push("live.controls must be a non-empty array");
            } else {
                for (const field of live.controls) {
                    if (!PLUGIN_LIVE_CONTROLLABLE.includes(field)) {
                        problems.push(`live.controls has unknown field "${field}", expected one of: ${PLUGIN_LIVE_CONTROLLABLE.join(", ")}`);
                    }
                }
            }
        }
    }

    if (plugin.handle_push === undefined && plugin.live === undefined) {
        problems.push("it needs a handle_push function, a live object, or both");
    }

    if (plugin.display_name !== undefined && typeof plugin.display_name !== "string") {
        problems.push("display_name must be a string");
    }

    return problems;
}

/**
 * Loads a plugin module and validates its structure, or returns the already loaded copy.<br>
 * The module must export a plugin object as its default export with a `handle_push` function, and optionally a `display_name` string.<br>
 * Plugins stay loaded until {@link clear_plugin_cache} is called, which happens automatically when plugin-env's packages change.
 * @param name the module name to load
 * @return the loaded plugin object
 */
export const load_plugin = (name: string) => {
    const cached_plugin = loaded_plugins.get(name);
    if (cached_plugin) {
        return cached_plugin;
    }

    // remember what was already cached so we can tell which modules this plugin pulled in
    const cache_before_load = new Set(Object.keys(require_from_plugin_env.cache));

    const module = require_from_plugin_env(name);

    for (const module_path of Object.keys(require_from_plugin_env.cache)) {
        if (!cache_before_load.has(module_path)) {
            plugin_module_paths.add(module_path);
        }
    }

    if (!module || typeof module !== "object" || !module.default) {
        throw new Error(`Plugin ${name} does not export a valid plugin object as default.`);
    }

    const plugin = module?.default;
    const problems = find_plugin_problems(plugin);

    if (problems.length > 0) {
        throw new Error(`Plugin ${name} isn't valid: ${problems.join("; ")}`);
    }

    loaded_plugins.set(name, plugin as Plugin);
    return plugin as Plugin;
}

// installing, removing or updating packages changes these files, so drop every loaded plugin when they do
for (const watched_file of ["package.json", "package-lock.json"]) {
    fs.watchFile(in_plugin_env(watched_file), {interval: 1000}, () => {
        console.log(`${watched_file} in plugin-env changed, clearing plugin cache.`);
        clear_plugin_cache();
    });
}

// TODO: might be zod time soon
