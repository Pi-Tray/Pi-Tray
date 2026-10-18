// what the editor asks about installed plugin packages, run as "pi-tray-service package info <package>"

import {createRequire} from "module";
import path from "path";

import {plugin_dir} from "@pi-tray/paths";
import {find_plugin_problems} from "@pi-tray/types";

import {package_folder} from "@pi-tray/installer/read";

interface PackageInfo {
    display_name?: string;
    description?: string;
    config_template?: unknown;
    live_controls?: unknown;
    pushable?: boolean;
    problems?: string[];
}

/**
 * Prints each plugin in an installed package as JSON, keyed by its name: its display name, description, config template,
 * live controls, whether it can be pushed, and why the server would refuse it, if it would.
 * @param package_name the package e.g. @pi-tray/builtin
 * @returns the exit code
 */
export const run_package_info_command = (package_name: string | undefined): number => {
    if (!package_name) {
        console.error("Usage: package info <package-name>");
        return 1;
    }

    const require_package = createRequire(plugin_dir + path.sep);

    let plugin_package: Record<string, any>;
    try {
        plugin_package = require_package(package_folder(package_name)) || {};
    } catch (error) {
        console.error(`Error loading package ${package_name}:`, error);
        return 1;
    }

    const package_info: Record<string, PackageInfo> = {};

    for (const [plugin_key, plugin] of Object.entries(plugin_package)) {
        // the same checks the server runs before using a package, so the editor can warn about broken ones
        const problems = find_plugin_problems(plugin);

        package_info[plugin_key] = {
            problems: problems.length > 0 ? problems : undefined,
            display_name: plugin?.display_name,
            description: plugin?.description,
            config_template: plugin?.config_template,
            live_controls: Array.isArray(plugin?.live?.controls) ? plugin.live.controls : undefined,
            pushable: typeof plugin?.handle_push === "function"
        };
    }

    console.log(JSON.stringify(package_info));
    return 0;
}
