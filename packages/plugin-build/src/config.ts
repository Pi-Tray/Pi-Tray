import fs from "fs";
import path from "path";

import {read_json} from "./dependencies";
import {DEFAULT_TARGETS} from "./targets";
import type {PackageManifest, PluginConfig} from "./types";

const DEFAULT_ENTRIES = ["src/index.ts", "src/index.js", "index.ts", "index.js"];

interface RawSettings {
    entry?: unknown;
    external?: unknown;
    targets?: unknown;
}

const string_list = (value: unknown, field: string): string[] => {
    if (value === undefined) {
        return [];
    }

    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(`"pi-tray"."${field}" in package.json should be a list of strings`);
    }

    return value;
}

/**
 * Reads the plugin's build settings from the "pi-tray" field of its package.json:
 * - entry: the file exporting the plugins, default src/index.ts (or the first of src/index.js, index.ts, index.js that exists)
 * - external: dependencies to leave out of the archive, e.g. optional ones a dependency only tries to load
 * - targets: the platforms to build for, if it has native modules, default every platform in targets.ts
 */
export const read_plugin_config = (root_dir: string): PluginConfig => {
    const manifest_path = path.join(root_dir, "package.json");

    if (!fs.existsSync(manifest_path)) {
        throw new Error(`No package.json in ${root_dir}`);
    }

    const manifest = read_json<PackageManifest>(manifest_path);
    const settings = (manifest["pi-tray"] ?? {}) as RawSettings;

    if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
        throw new Error("package.json needs a name and a version");
    }

    let entry: string;
    if (settings.entry === undefined) {
        const found_entry = DEFAULT_ENTRIES.find((candidate) => fs.existsSync(path.join(root_dir, candidate)));

        if (!found_entry) {
            throw new Error(`Couldn't find the plugin's entry file (tried ${DEFAULT_ENTRIES.join(", ")}), set "pi-tray"."entry" in package.json`);
        }

        entry = found_entry;
    } else if (typeof settings.entry !== "string" || !fs.existsSync(path.join(root_dir, settings.entry))) {
        throw new Error(`"pi-tray"."entry" (${settings.entry}) doesn't exist`);
    } else {
        entry = settings.entry;
    }

    const targets = settings.targets === undefined ? [...DEFAULT_TARGETS] : string_list(settings.targets, "targets");

    return {
        manifest: {...manifest, name: manifest.name, version: manifest.version},
        entry_path: path.join(root_dir, entry),
        external_names: new Set(string_list(settings.external, "external")),
        targets
    };
}
