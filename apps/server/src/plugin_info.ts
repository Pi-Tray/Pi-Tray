// answers the editor's questions about installed plugin packages, run as "pi-tray-service plugin-info <package>"
// only uses the plugin-env location and the shared checks, so it never starts or affects a running server

import {createRequire} from "module";

import {in_plugin_env} from "@pi-tray/paths";
import {find_plugin_problems} from "@pi-tray/types";

export type PluginInfoCommand = "list-plugins" | "plugin-info";

export const PLUGIN_INFO_COMMANDS: readonly PluginInfoCommand[] = ["list-plugins", "plugin-info"];

interface PluginInfo {
    display_name?: string;
    description?: string;
    config_template?: unknown;
    live_controls?: unknown;
    pushable?: boolean;
    problems?: string[];
}

/**
 * Prints information about the plugins in an installed package as JSON.
 * - list-plugins: the names of the plugins in the package
 * - plugin-info: each plugin's display name, description, config template, live controls,
 *   whether it can be pushed, and why the server would refuse it, if it would
 * @param command which information to print
 * @param package_name the package e.g. @pi-tray/builtin
 * @returns the exit code
 */
export const run_plugin_info_command = (command: PluginInfoCommand, package_name: string | undefined): number => {
    if (!package_name) {
        console.error(`Usage: ${command} <package-name>`);
        return 1;
    }

    const require_from_plugin_env = createRequire(in_plugin_env("package.json"));

    let plugin_package: Record<string, any>;
    try {
        plugin_package = require_from_plugin_env(package_name) || {};
    } catch (error) {
        console.error(`Error loading package ${package_name}:`, error);
        return 1;
    }

    if (command === "list-plugins") {
        console.log(JSON.stringify(Object.keys(plugin_package)));
        return 0;
    }

    const plugin_info: Record<string, PluginInfo> = {};

    for (const [plugin_key, plugin] of Object.entries(plugin_package)) {
        // the same checks the server runs before using a plugin, so the editor can warn about broken ones
        const problems = find_plugin_problems(plugin);

        plugin_info[plugin_key] = {
            problems: problems.length > 0 ? problems : undefined,
            display_name: plugin?.display_name,
            description: plugin?.description,
            config_template: plugin?.config_template,
            live_controls: Array.isArray(plugin?.live?.controls) ? plugin.live.controls : undefined,
            pushable: typeof plugin?.handle_push === "function"
        };
    }

    console.log(JSON.stringify(plugin_info));
    return 0;
}
