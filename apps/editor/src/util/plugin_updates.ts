import {exists, readTextFile} from "@tauri-apps/plugin-fs";
import {dataDir, join} from "@tauri-apps/api/path";

import {clear_plugin_info_cache, install_package} from "./plugins";

const appdata = await dataDir();
const plugin_env = await join(appdata, "pi-tray", "plugin-env");
const package_json_path = await join(plugin_env, "package.json");
const package_lock_path = await join(plugin_env, "package-lock.json");

export type PackageSource =
    | { kind: "github", owner: string, repo: string, ref: string | null }
    | { kind: "registry" }
    | { kind: "unsupported" };

export interface PackageUpdateStatus {
    /**
     * The package name, e.g. @pi-tray/builtin
     */
    name: string;

    /**
     * Where the package was installed from, as written in plugin-env's package.json, e.g. github:Pi-Tray/builtin-plugins#release
     */
    spec: string;

    source: PackageSource;

    /**
     * Installed version for registry packages, or installed commit hash for github packages.
     */
    installed: string | null;

    /**
     * Latest version for registry packages, or latest commit hash on the tracked branch for github packages.
     */
    latest: string | null;

    update_available: boolean;

    /**
     * Why the check failed, if it did.
     */
    error?: string;
}

const GITHUB_SPEC_PATTERNS = [
    // github:owner/repo#ref, which is how npm writes github installs to package.json
    /^github:([^/#]+)\/([^#]+?)(?:\.git)?(?:#(.+))?$/,
    // git+https://github.com/owner/repo.git#ref or git+ssh://git@github.com/owner/repo.git#ref
    /^git\+(?:https|ssh):\/\/(?:git@)?github\.com[/:]([^/]+)\/([^#]+?)(?:\.git)?(?:#(.+))?$/,
    // https://github.com/owner/repo#ref
    /^https:\/\/github\.com\/([^/]+)\/([^#]+?)(?:\.git)?(?:#(.+))?$/,
    // owner/repo#ref, npm's bare github shorthand
    /^([\w.-]+)\/([\w.-]+)(?:#(.+))?$/,
];

/**
 * Works out where a package in plugin-env's package.json was installed from.
 * @param spec the dependency value, e.g. `github:Pi-Tray/builtin-plugins` or `^1.2.0`
 */
export const parse_package_source = (spec: string): PackageSource => {
    for (const pattern of GITHUB_SPEC_PATTERNS) {
        const match = spec.match(pattern);
        if (match) {
            const ref = match[3] ?? null;

            // semver ranges against git tags would need tag resolution, not worth it for now
            if (ref && ref.startsWith("semver:")) {
                return {kind: "unsupported"};
            }

            return {kind: "github", owner: match[1], repo: match[2], ref};
        }
    }

    // file:, link:, tarball urls, other git hosts etc
    if (spec.includes(":") || spec.includes("/")) {
        return {kind: "unsupported"};
    }

    // anything left is a version, range or tag on the npm registry
    return {kind: "registry"};
}

/**
 * Asks GitHub for the current commit of a branch, tag or the default branch.<br>
 * Unauthenticated, so limited to 60 requests an hour per IP, which a shared network can use up.
 */
const fetch_latest_commit = async (owner: string, repo: string, ref: string | null): Promise<string> => {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref ?? "HEAD")}`,
        {headers: {Accept: "application/vnd.github.sha"}}
    );

    if (response.status === 403 || response.status === 429) {
        throw new Error("GitHub rate limit reached, try again later");
    }

    if (!response.ok) {
        throw new Error(`GitHub returned ${response.status}`);
    }

    return (await response.text()).trim();
}

const fetch_latest_registry_version = async (name: string): Promise<string> => {
    // scoped names need their slash encoded for the registry
    const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`);

    if (!response.ok) {
        throw new Error(`npm registry returned ${response.status}`);
    }

    const data = await response.json();
    return data.version;
}

/**
 * Gets what's actually installed for a package from the lockfile: the commit hash for git installs, otherwise the version.
 */
const get_installed = (lockfile: any, name: string, source: PackageSource): string | null => {
    // lockfile v2/v3 use "packages", v1 uses "dependencies" with the resolved git url in "version"
    const lock_entry = lockfile?.packages?.[`node_modules/${name}`];
    const legacy_entry = lockfile?.dependencies?.[name];

    if (source.kind === "github") {
        const resolved: string | undefined = lock_entry?.resolved ?? legacy_entry?.version;
        const hash_idx = resolved?.lastIndexOf("#") ?? -1;
        return resolved && hash_idx !== -1 ? resolved.slice(hash_idx + 1) : null;
    }

    return lock_entry?.version ?? legacy_entry?.version ?? null;
}

const check_package = async (name: string, spec: string, lockfile: any): Promise<PackageUpdateStatus> => {
    const source = parse_package_source(spec);
    const installed = get_installed(lockfile, name, source);

    const status: PackageUpdateStatus = {name, spec, source, installed, latest: null, update_available: false};

    try {
        if (source.kind === "github") {
            // pinned to an exact commit, there is nothing newer to move to
            if (source.ref && /^[0-9a-f]{40}$/i.test(source.ref)) {
                status.latest = source.ref;
            } else {
                status.latest = await fetch_latest_commit(source.owner, source.repo, source.ref);
            }
        } else if (source.kind === "registry") {
            status.latest = await fetch_latest_registry_version(name);
        } else {
            status.error = "Can't check this kind of install";
            return status;
        }

        status.update_available = installed !== null && status.latest !== installed;
    } catch (error) {
        status.error = error instanceof Error ? error.message : String(error);
    }

    return status;
}

/**
 * Checks every package in plugin-env for updates.<br>
 * GitHub installs compare the installed commit against the tracked branch, registry installs compare against the latest version.
 * @returns the status of each package, in package.json order
 */
export const check_plugin_updates = async (): Promise<PackageUpdateStatus[]> => {
    if (!await exists(package_json_path)) {
        return [];
    }

    const package_json = JSON.parse(await readTextFile(package_json_path));
    const lockfile = await exists(package_lock_path) ? JSON.parse(await readTextFile(package_lock_path)) : null;

    const dependencies: Record<string, string> = package_json.dependencies || {};

    return Promise.all(
        Object.entries(dependencies).map(([name, spec]) => check_package(name, spec, lockfile))
    );
}

/**
 * Updates a package by reinstalling it.<br>
 * GitHub installs are reinstalled from the same spec, which moves them to the branch's latest commit.
 * Registry installs are moved to the latest version.
 * @param status the status returned by {@link check_plugin_updates}
 */
export const update_plugin_package = async (status: PackageUpdateStatus) => {
    const update_spec = status.source.kind === "registry" ? `${status.name}@latest` : status.spec;

    await install_package(update_spec);

    // display names and config templates may have changed, and an in-place update doesn't always touch package.json
    clear_plugin_info_cache();
}
