import crypto from "crypto";
import fs from "fs";
import path from "path";

import {plugin_dir} from "@pi-tray/paths";

import {read_installed, write_installed} from "./installed";
import {package_data_path, package_folder, work_dir} from "./location";
import {with_install_lock} from "./lock";

export interface RemoveOptions {
    /** Also delete the package's data folder, e.g. saved logins */
    purge?: boolean;
}

export interface RemoveResult {
    name: string;

    /** The version that was removed, or null if its folder was there without being in the registry */
    version: string | null;

    purged: boolean;
}

// a scope folder left empty, e.g. <plugin dir>/@someone, once its last package is removed
const remove_empty_scope_folder = (folder: string) => {
    const scope_folder = path.dirname(folder);

    if (scope_folder !== plugin_dir && path.basename(scope_folder).startsWith("@") && fs.readdirSync(scope_folder).length === 0) {
        fs.rmdirSync(scope_folder);
    }
}

/**
 * Removes an installed package. Its data folder is kept unless options.purge is set, so reinstalling it keeps its settings.
 * @throws if it isn't installed, or its folder is in use (windows, while the server has its native modules loaded)
 */
export const remove_package = async (package_name: string, options: RemoveOptions = {}): Promise<RemoveResult> => {
    const folder = package_folder(package_name);

    return with_install_lock(async () => {
        const registry = read_installed();
        const installed = registry.packages[package_name] ?? null;
        const folder_exists = fs.existsSync(folder);

        if (!installed && !folder_exists) {
            throw new Error(`${package_name} isn't installed`);
        }

        if (folder_exists) {
            // moved out first, so a removal that fails part way through deleting never leaves half a package to load
            fs.mkdirSync(work_dir, {recursive: true});
            const removed_dir = path.join(work_dir, `removed-${crypto.randomBytes(4).toString("hex")}`);

            try {
                fs.renameSync(folder, removed_dir);
            } catch (error) {
                const code = (error as NodeJS.ErrnoException).code;
                if (code === "EPERM" || code === "EBUSY" || code === "EACCES") {
                    throw new Error(`${folder} is in use, stop the server and try again`);
                }
                throw error;
            }

            fs.rmSync(removed_dir, {recursive: true, force: true});
            remove_empty_scope_folder(folder);
        }

        delete registry.packages[package_name];
        write_installed(registry);

        if (options.purge) {
            fs.rmSync(package_data_path(package_name), {recursive: true, force: true});
        }

        return {name: package_name, version: installed?.version ?? null, purged: options.purge === true};
    });
}
