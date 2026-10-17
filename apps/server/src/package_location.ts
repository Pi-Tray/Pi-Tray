import path from "path";

import {in_plugin_data_dir, plugin_dir} from "@pi-tray/paths";
import fs from "fs";

// npm's package name rules: name or @scope/name, lowercase. also what keeps a name from pointing outside plugin_dir
const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

// what @pi-tray/plugin-build allows a plugin's export name to be
const PLUGIN_NAME_PATTERN = /^[A-Za-z0-9_$-]+$/;

export const is_valid_package_name = (package_name: string): boolean => PACKAGE_NAME_PATTERN.test(package_name);

/**
 * Splits a cell's plugin reference into its package and plugin, e.g. @pi-tray/builtin/run_command
 * into @pi-tray/builtin and run_command. A scoped package's name has two parts, anything else one.
 * @throws if it isn't a valid reference
 */
export const split_plugin_reference = (reference: string): {package_name: string, plugin_name: string} => {
    const parts = reference.split("/");
    const package_part_count = reference.startsWith("@") ? 2 : 1;

    const package_name = parts.slice(0, package_part_count).join("/");
    const plugin_name = parts[package_part_count];

    if (parts.length !== package_part_count + 1 || !is_valid_package_name(package_name) || !PLUGIN_NAME_PATTERN.test(plugin_name)) {
        throw new Error(`"${reference}" isn't a plugin reference like <package>/<plugin> or @<scope>/<package>/<plugin>`);
    }

    return {package_name, plugin_name};
}

/**
 * The folder an installed package is extracted to, e.g. <plugin dir>/@pi-tray/ghost.
 * @throws if it isn't a valid package name
 */
export const package_folder = (package_name: string): string => {
    if (!is_valid_package_name(package_name)) {
        throw new Error(`"${package_name}" isn't a valid package name`);
    }

    return path.join(plugin_dir, ...package_name.split("/"));
}

/**
 * The folder a package keeps its own files in, e.g. <data dir>/plugin-data/@pi-tray/discord, created if it doesn't exist.<br>
 * Outside the package's install folder, so its files survive the package being updated or reinstalled.
 * @throws if it isn't a valid package name
 */
export const package_data_folder = (package_name: string): string => {
    if (!is_valid_package_name(package_name)) {
        throw new Error(`"${package_name}" isn't a valid package name`);
    }

    const data_folder = in_plugin_data_dir(...package_name.split("/"));
    fs.mkdirSync(data_folder, {recursive: true});
    return data_folder;
}
