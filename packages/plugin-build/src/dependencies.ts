import fs from "fs";
import path from "path";

import type {PackageManifest, PackageRecord} from "./types";

export const read_json = <T = unknown>(file_path: string): T => JSON.parse(fs.readFileSync(file_path, "utf-8"));

/**
 * Finds an installed package the way node's require does: in node_modules next to the package that needs it,
 * then in each folder above, stopping at the plugin's root.
 * @returns the package's folder, or null if it isn't installed
 */
const find_installed_package = (name: string, from_dir: string, root_dir: string): string | null => {
    const resolved_root = path.resolve(root_dir);
    let search_dir = path.resolve(from_dir);

    for (;;) {
        // a node_modules folder never has its own node_modules, node skips those too
        if (path.basename(search_dir) !== "node_modules") {
            const candidate = path.join(search_dir, "node_modules", name);

            if (fs.existsSync(path.join(candidate, "package.json"))) {
                return candidate;
            }
        }

        if (search_dir === resolved_root) {
            return null;
        }

        const parent_dir = path.dirname(search_dir);
        if (parent_dir === search_dir) {
            return null;
        }

        search_dir = parent_dir;
    }
}

const contains_node_binary = (dir: string): boolean => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.isDirectory()) {
            // dependencies are checked as packages of their own
            if (entry.name === "node_modules") {
                continue;
            }

            if (contains_node_binary(path.join(dir, entry.name))) {
                return true;
            }
        } else if (entry.name.endsWith(".node")) {
            return true;
        }
    }

    return false;
}

const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"];

/**
 * Why what npm installs for a package depends on the platform, so a plugin using it has to be built on each platform.
 * - a native module: node-gyp (binding.gyp), node-pre-gyp ("binary"), prebuildify (prebuilds/), or any compiled .node file
 * - only installed on some platforms ("os" or "cpu"), e.g. a napi-rs package or one holding an executable, like @esbuild/win32-x64
 * - an install script, which may compile or download something for the platform it runs on, e.g. ffmpeg-static.
 *   some only print a message, which just means building per platform when it wasn't needed
 * @returns the reason, or null if it's the same on every platform
 */
export const platform_reason_for = (package_dir: string, manifest: PackageManifest): string | null => {
    if (manifest.gypfile || manifest.binary || fs.existsSync(path.join(package_dir, "binding.gyp"))
        || fs.existsSync(path.join(package_dir, "prebuilds")) || contains_node_binary(package_dir)) {
        return "native module";
    }

    if (manifest.os || manifest.cpu) {
        return "only installed on some platforms";
    }

    const install_script = INSTALL_SCRIPTS.find((script_name) => manifest.scripts?.[script_name]);
    if (install_script) {
        return `${install_script} script`;
    }

    return null;
}

interface LockfilePackage {
    dev?: boolean;
    os?: string[];
    cpu?: string[];
}

/**
 * Runtime packages the lockfile says npm only installs on some platforms, including ones this machine skipped,
 * e.g. chokidar's fsevents, which is only installed on macs. Without it, planning on linux would miss them.
 * @returns their names, or an empty list if there's no lockfile
 */
export const os_restricted_in_lockfile = (root_dir: string, excluded_names: Set<string>): string[] => {
    const lockfile_path = path.join(root_dir, "package-lock.json");

    if (!fs.existsSync(lockfile_path)) {
        return [];
    }

    const lockfile = read_json<{packages?: Record<string, LockfilePackage>}>(lockfile_path);
    const names = new Set<string>();

    for (const [package_path, entry] of Object.entries(lockfile.packages ?? {})) {
        if (!package_path || entry.dev || !(entry.os || entry.cpu)) {
            continue;
        }

        // node_modules/a/node_modules/@scope/b is @scope/b
        const name = package_path.slice(package_path.lastIndexOf("node_modules/") + "node_modules/".length);

        if (!excluded_names.has(name)) {
            names.add(name);
        }
    }

    return [...names].sort();
}

/**
 * A package's runtime dependencies, each with whether it's optional.<br>
 * Some packages list optional dependencies in dependencies too, and one listed anywhere as required stays required.
 */
const runtime_dependencies_of = (manifest: PackageManifest): Map<string, boolean> => {
    const dependencies = new Map<string, boolean>();
    const optional_dependencies = manifest.optionalDependencies ?? {};

    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
        dependencies.set(name, true);
    }

    for (const name of Object.keys(optional_dependencies)) {
        dependencies.set(name, true);
    }

    for (const name of Object.keys(manifest.dependencies ?? {})) {
        if (!optional_dependencies[name]) {
            dependencies.set(name, false);
        }
    }

    return dependencies;
}

/**
 * Every installed package the plugin needs at runtime: its dependencies and optional dependencies (if installed),
 * and theirs, never dev dependencies.
 * @param root_dir the plugin's folder, after npm ci
 * @param excluded_names packages to leave out entirely, with everything only they need
 * @returns the packages keyed by folder, and any required ones that aren't installed
 */
export const collect_runtime_packages = (root_dir: string, excluded_names: Set<string>): {packages: Map<string, PackageRecord>, missing: string[]} => {
    const root_manifest = read_json<PackageManifest>(path.join(root_dir, "package.json"));

    const packages = new Map<string, PackageRecord>();
    const missing: string[] = [];

    const visit = (name: string, from_dir: string, is_optional: boolean, needed_by: string): string | null => {
        if (excluded_names.has(name)) {
            return null;
        }

        const package_dir = find_installed_package(name, from_dir, root_dir);

        if (!package_dir) {
            if (!is_optional) {
                missing.push(`${name} (needed by ${needed_by})`);
            }

            return null;
        }

        if (packages.has(package_dir)) {
            return package_dir;
        }

        const manifest = read_json<PackageManifest>(path.join(package_dir, "package.json"));
        const record: PackageRecord = {
            name,
            version: manifest.version ?? "0.0.0",
            dir: package_dir,
            platform_reason: platform_reason_for(package_dir, manifest),
            os_restricted: Boolean(manifest.os || manifest.cpu),
            children: []
        };

        // added before visiting children, so dependency cycles end here
        packages.set(package_dir, record);

        for (const [child_name, child_is_optional] of runtime_dependencies_of(manifest)) {
            const child_dir = visit(child_name, package_dir, child_is_optional, `${name}@${record.version}`);

            if (child_dir) {
                record.children.push(child_dir);
            }
        }

        return package_dir;
    }

    for (const [name, is_optional] of runtime_dependencies_of(root_manifest)) {
        visit(name, root_dir, is_optional, root_manifest.name ?? "the plugin");
    }

    // the package that loads a platform package (e.g. koffi 3 loading @koromix/koffi-<platform>) is the same on every platform itself,
    // but which platform package it finds depends on where it was installed
    for (const record of packages.values()) {
        const loads_platform_package = record.children.some((child_dir) => packages.get(child_dir)?.os_restricted);

        // says more than an install script, which the loader often has too
        const has_weaker_reason = record.platform_reason === null || record.platform_reason.endsWith(" script");

        if (loads_platform_package && has_weaker_reason) {
            record.platform_reason = "loads a platform package";
        }
    }

    return {packages, missing};
}
