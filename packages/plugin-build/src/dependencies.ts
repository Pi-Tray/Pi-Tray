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

/**
 * Whether a package contains a native module, so the plugin has to be built on each platform.<br>
 * Catches node-gyp packages (binding.gyp), node-pre-gyp ones ("binary"), prebuildify ones (prebuilds/),
 * and anything else that ships a compiled .node file, e.g. koffi and napi-rs platform packages.
 */
export const is_native_package = (package_dir: string, manifest: PackageManifest): boolean => {
    if (manifest.gypfile || manifest.binary) {
        return true;
    }

    if (fs.existsSync(path.join(package_dir, "binding.gyp")) || fs.existsSync(path.join(package_dir, "prebuilds"))) {
        return true;
    }

    return contains_node_binary(package_dir);
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
            native: is_native_package(package_dir, manifest),
            // a platform package, e.g. @koromix/koffi-win32-x64, which npm only installs on its own platform
            platform_specific: Boolean(manifest.os || manifest.cpu),
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

    // the package that loads a platform package has no binary itself (e.g. koffi 3 loading @koromix/koffi-<platform>),
    // but it's what the plugin uses, so it counts as native too
    for (const record of packages.values()) {
        const loads_platform_package = record.children.some((child_dir) => {
            const child = packages.get(child_dir);
            return child !== undefined && child.native && child.platform_specific;
        });

        if (loads_platform_package) {
            record.native = true;
        }
    }

    return {packages, missing};
}
