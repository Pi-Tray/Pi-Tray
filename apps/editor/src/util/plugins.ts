import {useEffect, useMemo, useState} from "react";

import {mkdir, watch} from "@tauri-apps/plugin-fs";
import {Command} from "@tauri-apps/plugin-shell";

import type {PluginConfigTemplate, PluginLiveControllable} from "@pi-tray/types";

import {plugin_dir} from "./paths";

// the package manager's results, as "pi-tray package ..." prints them. written out here rather than imported from
// @pi-tray/installer, which is node code the webview can't load

export interface InstalledPackage {
    name: string;
    version: string;

    /** Where it was installed from, e.g. github:pi-tray/ghost-plugins, url:https://… or file:/path/to/archive.tgz */
    source: string;

    target: string;
    pinned: boolean;
    installed_at: string;
}

export interface ResolvedPackage {
    name: string;
    version: string;
    description: string | null;
    source: string;

    /** From the Pi-Tray org. Anything else should be confirmed by the user before installing */
    trusted: boolean;

    pinned: boolean;
    target: string;

    /** The plugins it exports, or null if the release doesn't list them */
    plugins: string[] | null;

    /** The release's manifest (author, license, repository, homepage, plugin details), or null for a local archive */
    manifest: Record<string, unknown> | null;

    /** What's installed under the same name, if anything */
    installed: Omit<InstalledPackage, "name"> | null;

    /** Installing it would replace a package from somewhere else, so ask first and install with replace */
    conflict: boolean;
}

export type InstallResult =
    | {status: "installed", name: string, version: string, previous_version: string | null, resolved: ResolvedPackage}
    | {status: "conflict", name: string, installed_source: string | null, new_source: string, resolved: ResolvedPackage};

export interface RemoveResult {
    name: string;
    version: string | null;
    purged: boolean;
}

// what "package install" exits with when it found a package of the same name from another source
const EXIT_CONFLICT = 2;

/**
 * Runs a pi-tray package command and parses its JSON result.
 * @param command_args the command and its arguments, e.g. ["install", "Pi-Tray/ghost-plugins"]
 * @throws with the package manager's error message if it failed
 */
const run_package_command = async <Result>(command_args: string[]): Promise<Result> => {
    const output = await Command.sidecar("binaries/pi-tray", ["package", ...command_args]).execute();

    if (output.code !== 0 && output.code !== EXIT_CONFLICT) {
        let message = output.stderr.trim() || `pi-tray package ${command_args[0]} exited with ${output.code}`;

        // errors are {"error": "..."}, apart from info's, which are plain text
        try {
            const parsed = JSON.parse(message) as {error?: unknown};
            if (typeof parsed.error === "string") {
                message = parsed.error;
            }
        } catch {
            // not JSON, use it as it is
        }

        throw new Error(message);
    }

    return JSON.parse(output.stdout.trim()) as Result;
}

/**
 * Lists the installed packages, as the package manager recorded them.
 * @returns the installed packages, sorted by name
 */
export const list_installed_packages = (): Promise<InstalledPackage[]> => run_package_command(["list"]);

/**
 * Works out what installing a spec would install without changing anything, so it can be shown to the user first:
 * its name, version and plugins, whether it's trusted, and whether it would replace a package from somewhere else.
 * @param spec what the user typed: owner/repo, owner/repo@tag, a GitHub or manifest link, or a path to a .tgz
 * @throws if it can't be installed, e.g. no release, not built for this platform, or a reserved name
 */
export const resolve_package = (spec: string): Promise<ResolvedPackage> => run_package_command(["resolve", spec]);

/**
 * Installs a package. A package of the same name from a different source is only replaced with replace set,
 * otherwise the result is a conflict, so the user can be asked first.
 * @param spec the same spec given to {@link resolve_package}
 * @param replace replace a package of the same name from a different source
 * @throws if it can't be installed, or the download or extraction fails
 */
export const install_package = (spec: string, replace = false): Promise<InstallResult> => {
    return run_package_command(["install", spec, ...(replace ? ["--replace"] : [])]);
}

/**
 * Removes an installed package.
 * @param package_name e.g. @pi-tray/discord
 * @param purge also delete the package's data folder, e.g. saved logins
 * @throws if it isn't installed, or it's in use (windows, while the server has its native modules loaded)
 */
export const remove_package = (package_name: string, purge = false): Promise<RemoveResult> => {
    return run_package_command(["remove", package_name, ...(purge ? ["--purge"] : [])]);
}

const change_listeners = new Set<() => void>();

/**
 * Subscribe to changes in the list of installed packages.<br>
 * This will notify the callback whenever the package manager installs or removes a package.
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
 * A React hook that provides the installed packages.
 * @param set_null_when_reindexing whether to set the package list to null while reindexing (default: true)
 * @returns the installed packages, or null if not yet loaded
 */
export const usePackageList = (set_null_when_reindexing = true) => {
    const [packages, setPackages] = useState<InstalledPackage[] | null>(null);

    useEffect(() => {
        const fetch_packages = async () => {
            if (set_null_when_reindexing) {
                setPackages(null);
            }

            try {
                setPackages(await list_installed_packages());
            } catch (error) {
                console.error("Failed to list installed packages:", error);
                setPackages([]);
            }
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

    const info_promise = run_package_command<Record<string, PluginInfo>>(["info", package_name]);

    // don't cache failures, so the next call retries
    info_promise.catch((error) => {
        console.error("Failed to get plugin info for package:", package_name, error);
        plugin_info_cache.delete(package_name);
    });

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

    /**
     * Its version and where it was installed from.
     */
    installed: InstalledPackage;

    plugins: IndexedPlugin[];

    /**
     * Why the package couldn't be indexed, if it couldn't.
     */
    error?: string;
}

/**
 * A React hook that indexes the plugins contributed by every installed package.<br>
 * Shares the plugin info cache, so each package only starts pi-tray CLI once until the installed packages change.
 * @returns each package with its plugins, sorted by package name, or null until the first index completes
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

        Promise.all(packages.map(async (installed): Promise<PackagePlugins> => {
            const package_name = installed.name;

            try {
                const package_info = await get_package_plugin_info(package_name);

                return {
                    package_name,
                    installed,
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
                return {package_name, installed, plugins: [], error: error instanceof Error ? error.message : String(error)};
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

// the package manager rewrites its registry (by renaming a new copy over it) after every install or removal.
// only the plugin folder itself is watched, so downloads and extractions in .tmp don't trigger it
const INSTALLED_FILE_NAME = ".installed.json";

await mkdir(plugin_dir, {recursive: true});
await watch(plugin_dir, (event) => {
    if (event.paths.some((changed_path) => changed_path.endsWith(INSTALLED_FILE_NAME))) {
        console.log("Installed packages changed, notifying listeners...");
        notify_package_list_change();
    }
}, {recursive: false});
