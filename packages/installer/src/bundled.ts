import crypto from "crypto";
import fs from "fs";
import path from "path";

import semver from "semver";

import {is_trusted_source, parse_spec} from "@pi-tray/package-spec";

import {install_resolved_package} from "./install";
import {InstalledRegistry, read_installed, write_installed} from "./installed";
import {work_dir} from "./location";
import {InstallLockedError, with_install_lock} from "./lock";
import {resolve_archive} from "./resolve";

/**
 * A package that ships with Pi-Tray, so there's something to use straight away, even offline.
 */
export interface BundledPackage {
    /** The archive's contents, read into memory first as it may be inside the executable, where tar can't open it */
    archive: Buffer;

    /** Where it's released, e.g. github:pi-tray/builtin-plugins. Recorded as its source, so it updates from there like any other package */
    source: string;
}

export interface BundledOutcome {
    name: string;
    version: string;

    /**
     * installed: put in place for the first time<br>
     * upgraded: replaced an older copy from the same source, e.g. after Pi-Tray itself was updated<br>
     * kept: already installed (or removed by the user) and nothing to do
     */
    action: "installed" | "upgraded" | "kept";
}

const should_upgrade = (registry: InstalledRegistry, name: string, source: string, version: string): boolean => {
    const installed = registry.packages[name];

    // only a copy from the same place that isn't pinned to a version, and only forwards
    return installed !== undefined
        && installed.source === source
        && !installed.pinned
        && semver.valid(installed.version) !== null
        && semver.valid(version) !== null
        && semver.gt(version, installed.version);
}

const ensure_one = async (bundled: BundledPackage): Promise<BundledOutcome> => {
    const parsed_source = parse_spec(bundled.source);
    if (!parsed_source.ok) {
        throw new Error(`Bundled package source "${bundled.source}" isn't valid: ${parsed_source.error}`);
    }

    // tar reads from a real file, so the archive is written out first
    fs.mkdirSync(work_dir, {recursive: true});
    const archive_path = path.join(work_dir, `bundled-${crypto.randomBytes(4).toString("hex")}.tgz`);
    fs.writeFileSync(archive_path, bundled.archive);

    try {
        const resolved = await resolve_archive(archive_path, {
            source: bundled.source,
            trusted: is_trusted_source(parsed_source.source)
        });

        const registry = read_installed();
        const offered = new Set(registry.offered_bundled ?? []);
        const first_time = !offered.has(resolved.name);

        const mark_offered = (registry_to_update: InstalledRegistry) => {
            registry_to_update.offered_bundled = [...new Set([...(registry_to_update.offered_bundled ?? []), resolved.name])].sort();
        };

        // not installed yet, or only a folder Pi-Tray didn't record, e.g. one unzipped by hand before the package manager existed
        if (first_time && !registry.packages[resolved.name]) {
            await install_resolved_package(resolved, mark_offered);
            return {name: resolved.name, version: resolved.version, action: "installed"};
        }

        if (should_upgrade(registry, resolved.name, resolved.source, resolved.version)) {
            await install_resolved_package(resolved, mark_offered);
            return {name: resolved.name, version: resolved.version, action: "upgraded"};
        }

        // installed already (from anywhere), or removed since it was offered
        if (first_time) {
            mark_offered(registry);
            write_installed(registry);
        }

        return {name: resolved.name, version: resolved.version, action: "kept"};
    } finally {
        fs.rmSync(archive_path, {force: true});
    }
}

/**
 * Installs the packages Pi-Tray ships, once each: a package that's been offered before is never installed again,
 * so removing one sticks. A newer bundled copy upgrades one still installed from the same source and not pinned.
 * @returns what happened to each, or null if another install was running, so this should be tried again next time
 * @throws if a bundled archive is broken
 */
export const ensure_bundled_packages = async (bundled_packages: BundledPackage[]): Promise<BundledOutcome[] | null> => {
    try {
        return await with_install_lock(async () => {
            const outcomes: BundledOutcome[] = [];

            for (const bundled of bundled_packages) {
                outcomes.push(await ensure_one(bundled));
            }

            return outcomes;
        });
    } catch (error) {
        if (error instanceof InstallLockedError) {
            return null;
        }
        throw error;
    }
}
