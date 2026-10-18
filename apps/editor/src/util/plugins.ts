import {useEffect, useMemo, useState} from "react";

import {exists, mkdir, readDir, watch} from "@tauri-apps/plugin-fs";
import {Command} from "@tauri-apps/plugin-shell";

import type {PluginConfigTemplate, PluginLiveControllable} from "@pi-tray/types";

import {plugin_dir} from "./paths";
import {join} from "@tauri-apps/api/path";

/**
 * Lists the installed packages from the plugin folder, one folder per package, with scoped ones (@scope/name) one level down.
 * @returns array of installed package names
 */
export const list_installed_packages = async (): Promise<string[]> => {
    if (!await exists(plugin_dir)) {
        return [];
    }

    const package_names: string[] = [];

    for (const entry of await readDir(plugin_dir)) {
        // skips .tmp and .pending
        if (!entry.isDirectory || entry.name.startsWith(".")) {
            continue;
        }

        if (entry.name.startsWith("@")) {
            for (const scoped_entry of await readDir(await join(plugin_dir, entry.name))) {
                if (scoped_entry.isDirectory) {
                    package_names.push(`${entry.name}/${scoped_entry.name}`);
                }
            }
        } else {
            package_names.push(entry.name);
        }
    }

    return package_names.sort();
}

const change_listeners = new Set<() => void>();

/**
 * Subscribe to changes in the list of installed packages.<br>
 * This will notify the callback whenever plugin-env's `package.json` file changes, indicating a change in the installed packages.
 * @param callback the callback to call when the list of installed packages changes
 */
export const subscribe_to_package_list_change = (callback: () => void): void => {
    change_listeners.add(callback);
}

/**
 * Unsubscribe from changes in the list of installed packages.
 * @param callback a reference equivalent to the callback passed to `subscribe_to_package_list_change`
 */
export const unsubscribe_from_package_list_change = (callback: () => void): void => {
    change_listeners.delete(callback);
}

const notify_package_list_change = (): void => {
    change_listeners.forEach(callback => callback());
}

/**
 * Forces display names and config templates to be fetched fresh on next use, e.g. after a package is updated in place.
 */
export const clear_plugin_info_cache = () => plugin_info_cache.clear();

/**
 * A React hook that provides the list of installed packages in plugin-env.
 * @param set_null_when_reindexing whether to set the package list to null while reindexing (default: true)
 * @returns array of installed plugin package names or null if not yet loaded
 */
export const usePackageList = (set_null_when_reindexing = true) => {
    const [packages, setPackages] = useState<string[] | null>(null);

    useEffect(() => {
        const fetch_packages = async () => {
            if (set_null_when_reindexing) {
                setPackages(null);
            }

            setPackages(await list_installed_packages());
        };

        fetch_packages();

        const listener = () => fetch_packages();
        subscribe_to_package_list_change(listener);

        return () => {
            unsubscribe_from_package_list_change(listener);
        };
    }, []);

    return packages;
}

/**
 * Installs a package in the plugins directory.
 * @param package_ref the package reference to install, such as a name or git url
 */
export const install_package = async (package_ref: string) => {
   throw new Error("not yet implemented for new package system");
}

export interface PluginInfo {
    display_name?: string;
    description?: string;
    config_template?: PluginConfigTemplate;
    live_controls?: PluginLiveControllable[];
    pushable?: boolean;

    /**
     * Why the server would refuse to run this plugin, if it would. Checked by pi-tray CLI with the server's own rules.
     */
    problems?: string[];
}

// keyed by package name, cleared whenever the installed packages change
const plugin_info_cache = new Map<string, Promise<Record<string, PluginInfo>>>();
subscribe_to_package_list_change(() => plugin_info_cache.clear());

/**
 * Asks pi-tray CLI for the display name and config template of every plugin in a package.<br>
 * Results are cached until the installed packages change, as each call starts a new process.
 * @param package_name the package name e.g. @pi-tray/builtin
 * @returns plugin info keyed by the plugin's name within the package, e.g. `run_command`
 */
const get_package_plugin_info = (package_name: string): Promise<Record<string, PluginInfo>> => {
    const cached_info = plugin_info_cache.get(package_name);
    if (cached_info) {
        return cached_info;
    }

    const info_promise = (async () => {
        const command = Command.sidecar("binaries/pi-tray", ["package", "info", package_name]);
        const result = await command.execute();

        if (result.code !== 0) {
            console.error("Failed to get plugin info for package:", package_name, result);
            throw new Error(`Failed to get plugin info for package: ${package_name}`);
        }

        return JSON.parse(result.stdout.trim()) as Record<string, PluginInfo>;
    })();

    // don't cache failures, so the next call retries
    info_promise.catch(() => plugin_info_cache.delete(package_name));

    plugin_info_cache.set(package_name, info_promise);
    return info_promise;
}

/**
 * Gets the display name and config template of a plugin.
 * @param plugin_name the fully qualified plugin name e.g. @pi-tray/builtin/run_command
 * @returns the plugin info, or null if the plugin isn't found in its package
 */
export const get_plugin_info = async (plugin_name: string): Promise<PluginInfo | null> => {
    // the plugin's own name is always the last segment, everything before it is the (possibly scoped) package
    const separator_idx = plugin_name.lastIndexOf("/");
    if (separator_idx <= 0) {
        return null;
    }

    const package_name = plugin_name.slice(0, separator_idx);
    const plugin_key = plugin_name.slice(separator_idx + 1);

    const package_info = await get_package_plugin_info(package_name);
    return package_info[plugin_key] ?? null;
}

/**
 * A React hook that provides a plugin's display name and config template.
 * @param plugin_name the fully qualified plugin name, or null if there is no plugin
 * @returns the plugin info, `undefined` while loading, or `null` if there is no plugin or it couldn't be loaded
 */
export const usePluginInfo = (plugin_name: string | null) => {
    const [info, setInfo] = useState<PluginInfo | null | undefined>(undefined);

    useEffect(() => {
        if (!plugin_name) {
            setInfo(null);
            return;
        }

        // ignore results that arrive after the plugin has changed
        let superseded = false;
        setInfo(undefined);

        get_plugin_info(plugin_name)
            .then(new_info => {
                if (!superseded) {
                    setInfo(new_info);
                }
            })
            .catch(error => {
                console.error(`Error getting info for plugin ${plugin_name}:`, error);
                if (!superseded) {
                    setInfo(null);
                }
            });

        return () => {
            superseded = true;
        };
    }, [plugin_name]);

    return info;
}

export interface IndexedPlugin {
    /**
     * Fully qualified plugin name, e.g. @pi-tray/builtin/run_command
     */
    name: string;

    display_name: string;

    description?: string;

    /**
     * Whether the plugin has a config template, i.e. has settings to fill in.
     */
    configurable: boolean;

    /**
     * Whether the plugin updates its button live, e.g. a clock.
     */
    live: boolean;

    /**
     * Why the server would refuse to run this plugin, if it would.
     */
    problems?: string[];
}

export interface PackagePlugins {
    package_name: string;
    plugins: IndexedPlugin[];

    /**
     * Why the package couldn't be indexed, if it couldn't.
     */
    error?: string;
}

/**
 * A React hook that indexes the plugins contributed by every installed package.<br>
 * Shares the plugin info cache, so each package only starts pi-tray CLI once until the installed packages change.
 * @returns each package with its plugins, in package.json order, or null until the first index completes
 */
export const usePluginIndex = () => {
    // keep showing the previous index while reindexing rather than flashing empty
    const packages = usePackageList(false);
    const [index, setIndex] = useState<PackagePlugins[] | null>(null);

    useEffect(() => {
        if (packages === null) {
            return;
        }

        // ignore results that arrive after the package list has changed again
        let superseded = false;

        Promise.all(packages.map(async (package_name): Promise<PackagePlugins> => {
            try {
                const package_info = await get_package_plugin_info(package_name);

                return {
                    package_name,
                    plugins: Object.entries(package_info).map(([plugin_key, info]) => ({
                        name: `${package_name}/${plugin_key}`,
                        display_name: info.display_name || plugin_key,
                        description: info.description,
                        configurable: !!info.config_template && Object.keys(info.config_template).length > 0,
                        live: (info.live_controls?.length ?? 0) > 0,
                        problems: info.problems
                    }))
                };
            } catch (error) {
                return {package_name, plugins: [], error: error instanceof Error ? error.message : String(error)};
            }
        })).then(new_index => {
            if (!superseded) {
                setIndex(new_index);
            }
        });

        return () => {
            superseded = true;
        };
    }, [packages]);

    return index;
}

/**
 * A React hook that provides every installed plugin's fully qualified name.
 * @returns array of plugin names, or null until the first index completes
 */
export const usePluginList = () => {
    const index = usePluginIndex();

    return useMemo(
        () => index ? index.flatMap(package_plugins => package_plugins.plugins.map(plugin => plugin.name)) : null,
        [index]
    );
}

// shared with the server, re-exported so the editor's existing imports keep working
export {unwrap_plugin_reference} from "@pi-tray/types";

// installing or removing a package adds or removes its folder. recursive, as scoped packages are a folder deeper
// TODO: watch the installer's .installed.json (installed_file) instead, so downloads in .tmp don't trigger it
await mkdir(plugin_dir, {recursive: true});
await watch(plugin_dir, () => {
    console.log("Plugin packages changed, notifying listeners...");
    notify_package_list_change();
}, {recursive: true});
