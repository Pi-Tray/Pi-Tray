import path from "path";
import fs from "fs";

import {is_valid_package_name} from "@pi-tray/package-spec";
import {in_plugin_data_dir, plugin_dir} from "@pi-tray/paths";

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
