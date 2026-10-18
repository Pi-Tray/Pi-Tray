import fs from "fs";
import os from "os";
import path from "path";

import {format_source, is_trusted_source, is_valid_package_name, locate_source, PackageSource} from "@pi-tray/package-spec";

import {read_archive_package_json} from "./archive";
import {InstalledPackage, read_installed} from "./installed";
import {package_folder} from "./location";

const MANIFEST_TIMEOUT_MS = 30 * 1000;

// only packages from the Pi-Tray org may use this scope
const RESERVED_SCOPE = "@pi-tray/";

const ANY_TARGET = "any";

/**
 * The target this machine needs, as @pi-tray/plugin-build names them.
 */
export const host_target = (): string => `${process.platform}-${process.arch}`;

export interface ManifestTarget {
    url: string;
    sha256: string;
    size: number;
    node_abi: string;
}

/**
 * The parts of a release's manifest.json the installer checks. The rest (description, plugins, etc.) is passed through for previews.
 */
export interface RemoteManifest {
    name: string;
    version: string;
    description?: string | null;
    plugins?: {key: string}[] | null;
    targets: Record<string, ManifestTarget>;
    [field: string]: unknown;
}

export type ArchiveLocation =
    | {type: "remote", url: string, sha256: string, size: number}
    | {type: "local", path: string};

export interface ResolvedPackage {
    name: string;
    version: string;
    description: string | null;

    /** Where it comes from, as recorded in the registry, e.g. github:pi-tray/ghost-plugins */
    source: string;

    /** From the Pi-Tray org, anything else should be confirmed by the user */
    trusted: boolean;

    /** A specific tag was asked for */
    pinned: boolean;

    target: string;

    /** The plugins it exports, or null if the release doesn't list them */
    plugins: string[] | null;

    /** The release's manifest, for showing more about it, or null for a local archive */
    manifest: RemoteManifest | null;

    archive: ArchiveLocation;

    /** What's installed under the same name, if anything */
    installed: InstalledPackage | null;

    /** Installing it would replace a package from somewhere else, or a folder Pi-Tray didn't install */
    conflict: boolean;
}

const is_manifest_target = (value: unknown): value is ManifestTarget => {
    const target = value as Partial<ManifestTarget> | null;

    return typeof target === "object" && target !== null
        && typeof target.url === "string"
        && typeof target.sha256 === "string" && /^[a-f0-9]{64}$/i.test(target.sha256)
        && typeof target.size === "number" && Number.isInteger(target.size) && target.size > 0
        && typeof target.node_abi === "string";
}

const validate_manifest = (value: unknown, manifest_url: string): RemoteManifest => {
    const manifest = value as Partial<RemoteManifest> | null;

    if (typeof manifest !== "object" || manifest === null || typeof manifest.name !== "string" || typeof manifest.version !== "string") {
        throw new Error(`${manifest_url} isn't a Pi-Tray plugin manifest, it has no name or version`);
    }

    if (typeof manifest.targets !== "object" || manifest.targets === null || Object.keys(manifest.targets).length === 0) {
        throw new Error(`${manifest_url} has no archives to install`);
    }

    for (const [target_name, target] of Object.entries(manifest.targets)) {
        if (!is_manifest_target(target)) {
            throw new Error(`${manifest_url} has a broken entry for ${target_name}`);
        }
    }

    return manifest as RemoteManifest;
}

const fetch_manifest = async (manifest_url: string): Promise<RemoteManifest> => {
    const response = await fetch(manifest_url, {signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS)});

    if (response.status === 404) {
        throw new Error(`No release found at ${manifest_url}, check the repo has a release made with @pi-tray/plugin-build`);
    }

    if (!response.ok) {
        throw new Error(`Couldn't get ${manifest_url}: ${response.status} ${response.statusText}`);
    }

    let manifest: unknown;
    try {
        manifest = await response.json();
    } catch {
        throw new Error(`${manifest_url} isn't JSON, so it isn't a Pi-Tray plugin manifest`);
    }

    return validate_manifest(manifest, manifest_url);
}

/**
 * The checks every package goes through, wherever it comes from.
 * @throws if it can't be installed on this machine, or uses a name it isn't allowed to
 */
const check_installable = (name: string, version: string, target: string, node_abi: string, trusted: boolean) => {
    if (!is_valid_package_name(name)) {
        throw new Error(`"${name}" isn't a valid package name`);
    }

    if (name.startsWith(RESERVED_SCOPE) && !trusted) {
        throw new Error(`${name} uses the @pi-tray scope, which only packages from the Pi-Tray GitHub org can use`);
    }

    if (version.length === 0) {
        throw new Error(`${name} has no version`);
    }

    if (target !== ANY_TARGET && target !== host_target()) {
        throw new Error(`${name} is built for ${target}, this machine needs ${host_target()}`);
    }

    // an "any" archive has no native modules, so the node it was built with doesn't matter
    if (target !== ANY_TARGET && node_abi !== process.versions.modules) {
        throw new Error(`${name} was built for a different Node.js (ABI ${node_abi}) to this one (ABI ${process.versions.modules}, Node.js ${process.versions.node})`);
    }
}

const find_installed = (name: string): {installed: InstalledPackage | null, folder_exists: boolean} => {
    const installed = read_installed().packages[name] ?? null;
    return {installed, folder_exists: fs.existsSync(package_folder(name))};
}

const resolve_remote = async (source: PackageSource, manifest_url: string): Promise<ResolvedPackage> => {
    const manifest = await fetch_manifest(manifest_url);
    const trusted = is_trusted_source(source);

    const host = host_target();
    const target = manifest.targets[host] ? host : manifest.targets[ANY_TARGET] ? ANY_TARGET : null;

    if (!target) {
        throw new Error(`${manifest.name} isn't built for ${host}, only ${Object.keys(manifest.targets).join(", ")}`);
    }

    const target_entry = manifest.targets[target];
    check_installable(manifest.name, manifest.version, target, target_entry.node_abi, trusted);

    // relative archive urls are relative to the manifest, e.g. for a manifest hosted next to its archives
    const archive_url = new URL(target_entry.url, manifest_url);
    if (archive_url.protocol !== "https:" && archive_url.protocol !== "http:") {
        throw new Error(`${manifest.name}'s archive isn't an http or https link: ${target_entry.url}`);
    }

    const formatted_source = format_source(source);
    const {installed, folder_exists} = find_installed(manifest.name);

    return {
        name: manifest.name,
        version: manifest.version,
        description: typeof manifest.description === "string" ? manifest.description : null,
        source: formatted_source,
        trusted,
        pinned: source.kind === "github" && source.tag !== undefined,
        target,
        plugins: Array.isArray(manifest.plugins) ? manifest.plugins.map((plugin) => plugin.key) : null,
        manifest,
        archive: {type: "remote", url: archive_url.href, sha256: target_entry.sha256.toLowerCase(), size: target_entry.size},
        installed,
        conflict: installed ? installed.source !== formatted_source : folder_exists
    };
}

// the same file always gives the same source, wherever it was typed from
const absolute_archive_path = (archive_path: string): string => {
    const expanded = /^~[\\/]/.test(archive_path) ? path.join(os.homedir(), archive_path.slice(2)) : archive_path;
    return path.resolve(expanded).replace(/^[a-z]:/, (drive) => drive.toUpperCase());
}

/**
 * Where an archive really came from, for one that Pi-Tray ships rather than one the user picked.
 */
export interface ArchiveOrigin {
    /** Recorded as its source, e.g. github:pi-tray/builtin-plugins, so it's updated from there like any other package */
    source: string;
    trusted: boolean;
}

/**
 * Works out what installing a local archive would install, as {@link resolve_package} does for a file spec.
 * @param origin where it really came from, for an archive Pi-Tray ships. Without it, the file is the source and it isn't trusted
 */
export const resolve_archive = async (archive_path: string, origin?: ArchiveOrigin): Promise<ResolvedPackage> => {
    const absolute_path = absolute_archive_path(archive_path);

    if (!fs.existsSync(absolute_path) || !fs.statSync(absolute_path).isFile()) {
        throw new Error(`${absolute_path} isn't a file, give the path to a .tgz that pi-tray-plugin build made`);
    }

    const package_json = await read_archive_package_json(absolute_path);
    const build_info = package_json["pi-tray"];
    const trusted = origin?.trusted ?? false;

    // a file the user picked is never trusted, so it can never use the @pi-tray scope
    check_installable(package_json.name, package_json.version, build_info.target, build_info.node_abi, trusted);

    const formatted_source = origin?.source ?? format_source({kind: "file", path: absolute_path});
    const {installed, folder_exists} = find_installed(package_json.name);

    return {
        name: package_json.name,
        version: package_json.version,
        description: typeof package_json.description === "string" ? package_json.description : null,
        source: formatted_source,
        trusted,
        pinned: false,
        target: build_info.target,
        plugins: Array.isArray(build_info.plugins) ? build_info.plugins : null,
        manifest: null,
        archive: {type: "local", path: absolute_path},
        installed,
        conflict: installed ? installed.source !== formatted_source : folder_exists
    };
}

/**
 * Works out what installing a source would install, without changing anything: what it is, whether it's trusted,
 * the archive for this machine, and whether it would replace a package from somewhere else.
 * @throws if it can't be installed here, e.g. no release, not built for this platform, or a reserved name
 */
export const resolve_package = async (source: PackageSource): Promise<ResolvedPackage> => {
    const location = locate_source(source);

    return location.type === "manifest"
        ? resolve_remote(source, location.url)
        : resolve_archive(location.path);
}
