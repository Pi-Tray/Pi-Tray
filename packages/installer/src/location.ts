import fs from "fs";
import path from "path";

import {is_valid_package_name} from "@pi-tray/package-spec";
import {in_plugin_data_dir, in_plugin_dir, plugin_dir} from "@pi-tray/paths";

// package names can't start with ".", so nothing the installer keeps in the plugin dir can collide with a package's folder

/**
 * Every installed package's source and version, written by the installer and watched by the server.
 */
export const installed_file = in_plugin_dir(".installed.json");

/**
 * Held while installing or removing, so two installs can't interleave.
 */
export const lock_file = in_plugin_dir(".lock");

/**
 * Downloads and extractions in progress, on the same drive as the plugin dir so finished ones can be renamed into place.
 */
export const work_dir = in_plugin_dir(".tmp");

const check_package_name = (package_name: string) => {
    if (!is_valid_package_name(package_name)) {
        throw new Error(`"${package_name}" isn't a valid package name`);
    }
}

/**
 * The folder an installed package is extracted to, e.g. <plugin dir>/@pi-tray/ghost.
 * @throws if it isn't a valid package name
 */
export const package_folder = (package_name: string): string => {
    check_package_name(package_name);
    return path.join(plugin_dir, ...package_name.split("/"));
}

/**
 * The folder a package keeps its own files in, e.g. <data dir>/plugin-data/@pi-tray/discord, without creating it.
 * @throws if it isn't a valid package name
 */
export const package_data_path = (package_name: string): string => {
    check_package_name(package_name);
    return in_plugin_data_dir(...package_name.split("/"));
}

/**
 * The folder a package keeps its own files in, e.g. <data dir>/plugin-data/@pi-tray/discord, created if it doesn't exist.<br>
 * Outside the package's install folder, so its files survive the package being updated or reinstalled.
 * @throws if it isn't a valid package name
 */
export const package_data_folder = (package_name: string): string => {
    const data_folder = package_data_path(package_name);
    fs.mkdirSync(data_folder, {recursive: true});
    return data_folder;
}
