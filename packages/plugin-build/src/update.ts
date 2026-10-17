import fs from "fs";
import path from "path";

import semver from "semver";

// where @pi-tray/types and @pi-tray/plugin-build are released, as github release tarballs
const DEFAULT_SOURCE_REPO = "Pi-Tray/Pi-Tray";

// each tool's release tags look like <prefix>-v<version>, e.g. plugin-build-v0.1.0
const TOOLS = [
    {package_name: "@pi-tray/types", tag_prefix: "types"},
    {package_name: "@pi-tray/plugin-build", tag_prefix: "plugin-build"}
] as const;

const MAX_RELEASE_PAGES = 10;

interface GithubRelease {
    tag_name: string;
    draft: boolean;
    assets: {name: string, browser_download_url: string}[];
}

export interface UpdateChange {
    what: string;
    from: string;
    to: string;
}

export interface UpdateResult {
    changes: UpdateChange[];

    /** Things the plugin's author has to do by hand, e.g. move to a new major version */
    notes: string[];
}

export interface UpdateOptions {
    /** The repo the tools are released from, default Pi-Tray/Pi-Tray */
    source_repo?: string;

    /** Raises github's api rate limit, e.g. GITHUB_TOKEN in actions */
    github_token?: string;
}

const fetch_releases = async (source_repo: string, github_token: string | undefined): Promise<GithubRelease[]> => {
    const releases: GithubRelease[] = [];

    for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
        const response = await fetch(`https://api.github.com/repos/${source_repo}/releases?per_page=100&page=${page}`, {
            headers: {
                "Accept": "application/vnd.github+json",
                ...(github_token ? {"Authorization": `Bearer ${github_token}`} : {})
            }
        });

        if (!response.ok) {
            throw new Error(`Couldn't list ${source_repo}'s releases: ${response.status} ${response.statusText}`);
        }

        const page_releases = await response.json() as GithubRelease[];
        releases.push(...page_releases);

        if (page_releases.length < 100) {
            break;
        }
    }

    return releases.filter((release) => !release.draft);
}

/**
 * The newest release of a tool, and its tarball's url.<br>
 * Pre-releases (e.g. 0.1.0-alpha) are only picked while the plugin is already on one, so a plugin on a stable version stays on stable ones.
 * @param major only consider this major version, or any if null
 */
const newest_release = (releases: GithubRelease[], tag_prefix: string, current_version: string | null, major: number | null) => {
    const allow_prereleases = current_version === null || semver.prerelease(current_version) !== null;
    const tag_start = `${tag_prefix}-v`;

    const candidates = releases
        .filter((release) => release.tag_name.startsWith(tag_start))
        .map((release) => ({release, version: semver.valid(release.tag_name.slice(tag_start.length))}))
        .filter((candidate): candidate is {release: GithubRelease, version: string} => candidate.version !== null)
        .filter((candidate) => allow_prereleases || semver.prerelease(candidate.version) === null)
        .filter((candidate) => major === null || semver.major(candidate.version) === major)
        .sort((first, second) => semver.rcompare(first.version, second.version));

    for (const {release, version} of candidates) {
        const tarball = release.assets.find((asset) => asset.name.endsWith(".tgz"));

        if (tarball) {
            return {version, tag: release.tag_name, url: tarball.browser_download_url};
        }
    }

    return null;
}

// the version in a tarball url like .../releases/download/plugin-build-v0.1.0/pi-tray-plugin-build-0.1.0.tgz
const version_in_url = (url: string, tag_prefix: string): string | null => {
    const match = url.match(new RegExp(`/releases/download/${tag_prefix}-v([^/]+)/`));
    return match ? match[1] : null;
}

// keeps the file's own indentation, so updates don't reformat it
const write_json_like = (file_path: string, original_text: string, value: unknown) => {
    const indent = original_text.match(/^[ \t]+(?=")/m)?.[0] ?? "  ";
    fs.writeFileSync(file_path, JSON.stringify(value, null, indent) + (original_text.endsWith("\n") ? "\n" : ""));
}

// a workflow line calling one of the shared workflows, e.g. Pi-Tray/Pi-Tray/.github/workflows/plugin-release.yml@plugin-build-v0
const shared_workflow_refs = (workflow_text: string, source_repo: string): string[] => {
    const pattern = new RegExp(`${source_repo.replace("/", "\\/")}\\/\\.github\\/workflows\\/[\\w.-]+@([\\w.+-]+)`, "g");
    return [...workflow_text.matchAll(pattern)].map((match) => match[1]);
}

/**
 * Checks the plugin's workflows call the shared workflows at the moving tag for its tool's major version, e.g. @plugin-build-v0.
 * Workflow files can't be changed by the update workflow (github doesn't let its token edit them), so this only says what to change.
 */
const check_workflow_refs = (root_dir: string, source_repo: string, tool_major: number | null): string[] => {
    const workflows_dir = path.join(root_dir, ".github", "workflows");
    const notes: string[] = [];

    if (tool_major === null || !fs.existsSync(workflows_dir)) {
        return notes;
    }

    const expected_ref = `plugin-build-v${tool_major}`;

    for (const file_name of fs.readdirSync(workflows_dir)) {
        if (!/\.ya?ml$/.test(file_name)) {
            continue;
        }

        const workflow_text = fs.readFileSync(path.join(workflows_dir, file_name), "utf-8");

        for (const ref of new Set(shared_workflow_refs(workflow_text, source_repo))) {
            if (ref !== expected_ref) {
                notes.push(`.github/workflows/${file_name} calls the shared workflows at @${ref}, change it to @${expected_ref} by hand`);
            }
        }
    }

    return notes;
}

/**
 * Updates a plugin to the newest @pi-tray/types and @pi-tray/plugin-build within their current major versions,
 * by changing the tarball urls in its package.json. Doesn't touch package-lock.json, run npm install afterwards.<br>
 * The plugin's workflows call the shared workflows at a tag that moves with each release of the same major version
 * (e.g. @plugin-build-v0), so they never need changing for an update, only for a new major version.
 * @returns what changed (empty if it was already up to date), and anything to do by hand
 */
export const update = async (root_dir: string, options: UpdateOptions = {}): Promise<UpdateResult> => {
    const source_repo = options.source_repo ?? DEFAULT_SOURCE_REPO;
    const releases = await fetch_releases(source_repo, options.github_token);
    const changes: UpdateChange[] = [];
    const notes: string[] = [];

    const manifest_path = path.join(root_dir, "package.json");
    const manifest_text = fs.readFileSync(manifest_path, "utf-8");
    const manifest = JSON.parse(manifest_text);

    let tool_major: number | null = null;

    for (const tool of TOOLS) {
        const section = ["devDependencies", "dependencies"].find((name) => manifest[name]?.[tool.package_name] !== undefined);
        const current_url: string | undefined = section ? manifest[section][tool.package_name] : undefined;
        const current_version = current_url ? version_in_url(current_url, tool.tag_prefix) : null;

        if (!section || !current_url) {
            console.warn(`${tool.package_name} isn't a dependency, skipping it`);
            continue;
        }

        if (!current_version || !semver.valid(current_version)) {
            notes.push(`${tool.package_name} isn't a ${source_repo} release tarball (${current_url}), so it can't be updated`);
            continue;
        }

        // a new major version can break things, so it's only ever moved to by hand
        const current_major = semver.major(current_version);
        const newest = newest_release(releases, tool.tag_prefix, current_version, current_major);
        const newest_any_major = newest_release(releases, tool.tag_prefix, current_version, null);

        if (newest_any_major && semver.major(newest_any_major.version) > current_major) {
            notes.push(`${tool.package_name} ${newest_any_major.version} is out, a new major version, which has to be moved to by hand`);
        }

        if (tool.tag_prefix === "plugin-build") {
            tool_major = current_major;
        }

        if (!newest || !semver.gt(newest.version, current_version)) {
            continue;
        }

        manifest[section][tool.package_name] = newest.url;
        changes.push({what: tool.package_name, from: current_version, to: newest.version});
    }

    if (changes.length > 0) {
        write_json_like(manifest_path, manifest_text, manifest);
    }

    notes.push(...check_workflow_refs(root_dir, source_repo, tool_major));

    return {changes, notes};
}
