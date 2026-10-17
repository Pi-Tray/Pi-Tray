import fs from "fs";
import path from "path";

import {read_json} from "./dependencies";
import type {ArchiveInfo, PluginManifest} from "./types";

export const MANIFEST_FILE = "manifest.json";

export interface ManifestOptions {
    /** Where the archives will be downloadable from, e.g. a github release's download url */
    base_url: string;

    /** The release's page, e.g. its github release */
    release_notes_url?: string;

    /** Used if the plugin's package.json has no repository, e.g. the github repo it's built from */
    repository_url?: string;
}

/**
 * Combines the .json written next to each built archive into one manifest.json, which the installer reads to pick
 * the archive for its platform: targets["<platform>-<arch>"], or targets.any for a plugin without native modules.
 * It also describes the release and its plugins, so a plugin browser can show them without downloading anything.
 * @param dist_dir the folder holding every target's archive and .json, e.g. after downloading every runner's artifact
 */
export const write_manifest = (dist_dir: string, options: ManifestOptions): PluginManifest => {
    const archive_infos = fs.readdirSync(dist_dir)
        .filter((file_name) => file_name.endsWith(".json") && file_name !== MANIFEST_FILE)
        .map((file_name) => read_json<ArchiveInfo>(path.join(dist_dir, file_name)));

    if (archive_infos.length === 0) {
        throw new Error(`No built archives in ${dist_dir}`);
    }

    const {name, version, metadata} = archive_infos[0];
    const targets: PluginManifest["targets"] = {};

    // every target is built from the same commit, so they should load the same plugins. the first that loaded them describes them
    const plugins = archive_infos.find((info) => info.plugins !== null)?.plugins ?? null;
    if (plugins === null) {
        console.warn("No archive was built with its plugins loaded (--skip-verify), so the manifest won't list them");
    }

    for (const info of archive_infos) {
        if (info.name !== name || info.version !== version) {
            throw new Error(`${dist_dir} mixes ${name}@${version} with ${info.name}@${info.version}`);
        }

        if (info.plugins !== null && JSON.stringify(info.plugins) !== JSON.stringify(plugins)) {
            throw new Error(`${info.target}'s archive has different plugins to the others, rebuild them from the same commit`);
        }

        if (targets[info.target]) {
            throw new Error(`Two archives for ${info.target}`);
        }

        if (!fs.existsSync(path.join(dist_dir, info.file))) {
            throw new Error(`${info.file} is missing`);
        }

        targets[info.target] = {
            url: `${options.base_url.replace(/\/+$/, "")}/${encodeURIComponent(info.file)}`,
            sha256: info.sha256,
            size: info.size,
            node_abi: info.node_abi
        };
    }

    if (targets.any && Object.keys(targets).length > 1) {
        throw new Error("Has an archive for any platform as well as per-platform ones, rebuild them from the same commit");
    }

    const manifest: PluginManifest = {
        name,
        version,
        ...metadata,
        repository: metadata.repository ?? options.repository_url ?? null,
        published_at: new Date().toISOString(),
        release_notes_url: options.release_notes_url ?? null,
        platforms: Object.keys(targets).sort(),
        plugins,
        targets
    };
    fs.writeFileSync(path.join(dist_dir, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + "\n");

    return manifest;
}
