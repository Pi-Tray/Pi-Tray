import fs from "fs";
import path from "path";

import {installed_file} from "./location";

export interface InstalledPackage {
    version: string;

    /** Where it was installed from, as format_source gives it, e.g. github:pi-tray/ghost-plugins. Updates re-resolve from it */
    source: string;

    /** The archive's target, e.g. win32-x64, or any */
    target: string;

    /** Installed from a specific tag, so updates leave it alone until it's installed again without one */
    pinned: boolean;

    installed_at: string;
}

export interface InstalledRegistry {
    schema_version: 1;
    packages: Record<string, InstalledPackage>;
}

const empty_registry = (): InstalledRegistry => ({schema_version: 1, packages: {}});

const is_installed_package = (value: unknown): value is InstalledPackage => {
    const entry = value as Partial<InstalledPackage> | null;

    return typeof entry === "object" && entry !== null
        && typeof entry.version === "string"
        && typeof entry.source === "string"
        && typeof entry.target === "string"
        && typeof entry.pinned === "boolean"
        && typeof entry.installed_at === "string";
}

/**
 * Reads the installed packages, or none if nothing has been installed yet.
 * @throws if the file exists but isn't a registry this version understands
 */
export const read_installed = (): InstalledRegistry => {
    let text: string;

    try {
        text = fs.readFileSync(installed_file, "utf-8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return empty_registry();
        }
        throw error;
    }

    const registry = JSON.parse(text) as Partial<InstalledRegistry>;

    if (registry.schema_version !== 1 || typeof registry.packages !== "object" || registry.packages === null) {
        throw new Error(`${installed_file} isn't a registry this version of Pi-Tray understands`);
    }

    for (const [package_name, entry] of Object.entries(registry.packages)) {
        if (!is_installed_package(entry)) {
            throw new Error(`${installed_file} has a broken entry for ${package_name}`);
        }
    }

    return registry as InstalledRegistry;
}

/**
 * Replaces the registry in one step, so the server never reads a half written file.
 * Only call it while holding the install lock.
 */
export const write_installed = (registry: InstalledRegistry) => {
    fs.mkdirSync(path.dirname(installed_file), {recursive: true});

    const temporary_file = `${installed_file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary_file, JSON.stringify(registry, null, 2) + "\n");
    fs.renameSync(temporary_file, installed_file);
}
