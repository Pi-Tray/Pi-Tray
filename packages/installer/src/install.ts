import crypto from "crypto";
import fs from "fs";
import path from "path";

import {parse_spec} from "@pi-tray/package-spec";

import {download_archive, extract_package, read_archive_package_json} from "./archive";
import {InstalledRegistry, read_installed, write_installed} from "./installed";
import {package_folder, work_dir} from "./location";
import {with_install_lock} from "./lock";
import {resolve_package, ResolvedPackage} from "./resolve";

export interface InstallOptions {
    /** Replace a package of the same name from a different source, otherwise that's reported as a conflict */
    replace?: boolean;
}

export type InstallResult =
    | {status: "installed", name: string, version: string, previous_version: string | null, resolved: ResolvedPackage}
    | {status: "conflict", name: string, installed_source: string | null, new_source: string, resolved: ResolvedPackage};

/**
 * Parses a spec as typed, e.g. Pi-Tray/ghost-plugins, a link or a path to a .tgz.
 * @throws with the reason it isn't one
 */
export const parse_install_spec = (spec: string) => {
    const parsed = parse_spec(spec);

    if (!parsed.ok) {
        throw new Error(parsed.error);
    }

    return parsed.source;
}

const is_locked_error = (error: unknown): boolean => {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

// swaps the new folder in, putting the old one back if that fails, so a failed install never leaves the package missing
const move_into_place = (extracted_dir: string, destination: string, attempt_dir: string) => {
    fs.mkdirSync(path.dirname(destination), {recursive: true});

    let displaced_dir: string | null = null;

    if (fs.existsSync(destination)) {
        displaced_dir = path.join(attempt_dir, "previous");

        try {
            fs.renameSync(destination, displaced_dir);
        } catch (error) {
            if (is_locked_error(error)) {
                // windows won't move a folder while the server has one of its native modules loaded
                throw new Error(`${destination} is in use, stop the server and try again`);
            }
            throw error;
        }
    }

    try {
        fs.renameSync(extracted_dir, destination);
    } catch (error) {
        if (displaced_dir) {
            fs.renameSync(displaced_dir, destination);
        }
        throw error;
    }
}

const install_resolved = async (resolved: ResolvedPackage, attempt_dir: string) => {
    let archive_path: string;

    if (resolved.archive.type === "remote") {
        archive_path = path.join(attempt_dir, "archive.tgz");
        await download_archive(resolved.archive.url, resolved.archive.sha256, resolved.archive.size, archive_path);
    } else {
        archive_path = resolved.archive.path;
    }

    // the archive has to be what the manifest said it was, a mismatched one could be for another platform or package
    const package_json = await read_archive_package_json(archive_path);
    if (package_json.name !== resolved.name || package_json.version !== resolved.version || package_json["pi-tray"].target !== resolved.target) {
        throw new Error(`The archive is ${package_json.name}@${package_json.version} for ${package_json["pi-tray"].target}, `
            + `but ${resolved.name}@${resolved.version} for ${resolved.target} was expected`);
    }

    const extracted_dir = path.join(attempt_dir, "package");
    await extract_package(archive_path, extracted_dir);

    move_into_place(extracted_dir, package_folder(resolved.name), attempt_dir);
}

/**
 * Installs a package from a spec, e.g. Pi-Tray/ghost-plugins, Pi-Tray/ghost-plugins@v1.0.2, a manifest link or a path to a .tgz.<br>
 * A package of the same name from a different source isn't replaced unless options.replace is set,
 * so the caller can ask the user first.
 * @throws if the spec isn't valid, it can't be installed here, or the download or extraction fails
 */
export const install_package = async (spec: string, options: InstallOptions = {}): Promise<InstallResult> => {
    const source = parse_install_spec(spec);

    return with_install_lock(async () => {
        const resolved = await resolve_package(source);

        if (resolved.conflict && !options.replace) {
            return {
                status: "conflict",
                name: resolved.name,
                installed_source: resolved.installed?.source ?? null,
                new_source: resolved.source,
                resolved
            };
        }

        await install_resolved_package(resolved);

        return {
            status: "installed",
            name: resolved.name,
            version: resolved.version,
            previous_version: resolved.installed?.version ?? null,
            resolved
        };
    });
}

/**
 * Downloads (if it's remote), extracts and swaps in a resolved package, then records it. Only call it while holding the install lock.
 * @param update_registry any other change to make in the same registry write
 */
export const install_resolved_package = async (resolved: ResolvedPackage, update_registry?: (registry: InstalledRegistry) => void) => {
    fs.mkdirSync(work_dir, {recursive: true});
    const attempt_dir = fs.mkdtempSync(path.join(work_dir, `${crypto.randomBytes(4).toString("hex")}-`));

    try {
        await install_resolved(resolved, attempt_dir);
    } finally {
        fs.rmSync(attempt_dir, {recursive: true, force: true});
    }

    // written last, so the server only reloads once the new files are in place
    const registry = read_installed();
    registry.packages[resolved.name] = {
        version: resolved.version,
        source: resolved.source,
        target: resolved.target,
        pinned: resolved.pinned,
        installed_at: new Date().toISOString()
    };
    update_registry?.(registry);
    write_installed(registry);
}
