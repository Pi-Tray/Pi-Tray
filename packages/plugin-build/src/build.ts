import fs from "fs";
import path from "path";
import {createHash} from "crypto";
import {execFileSync} from "child_process";
import {createRequire} from "module";

import * as esbuild from "esbuild";
import {create as create_tar} from "tar";

import {read_plugin_config} from "./config";
import {collect_runtime_packages, os_restricted_in_lockfile, read_json} from "./dependencies";
import {server_node_major} from "./node_version";
import {prune_other_targets} from "./prune";
import {ANY_TARGET, host_target, runner_for_target} from "./targets";
import type {ArchiveInfo, BuildPlan, PackageManifest, PackageMetadata, PackageRecord, PluginConfig, PluginInfo} from "./types";

// the node the server is packaged with, from engines in the monorepo's package.json
const NODE_MAJOR = server_node_major();
const NODE_TARGET = `node${NODE_MAJOR}`;

// dist/build.js, so the package's own package.json is one folder up
const TOOL_VERSION = read_json<PackageManifest>(path.join(__dirname, "..", "package.json")).version;

// plugin names become folders in the archive, next to these
const RESERVED_PLUGIN_NAMES = new Set(["node_modules", "index.js", "package.json"]);
const PLUGIN_NAME_PATTERN = /^[A-Za-z0-9_$-]+$/;

const COPIED_ROOT_FILES = /^(readme|license|licence|notice)(\..*)?$/i;

export interface BuildOptions {
    /** The target being built, which must be this machine's, or "any" for a plugin that's the same on every platform. Default: this machine's */
    target?: string;

    /** Where archives go, relative to the plugin's folder */
    out_dir: string;

    /** Whether to load the built plugins to check them */
    verify: boolean;
}

interface PluginAnalysis {
    config: PluginConfig;
    packages: Map<string, PackageRecord>;
    platform_packages: PackageRecord[];

    /** Packages the lockfile only installs on some platforms, which this machine may not have installed */
    lockfile_platform_packages: string[];
}

const describe_bytes = (bytes: number): string => {
    return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Reads the plugin's settings and the packages it needs at runtime.
 */
const analyse_plugin = (root_dir: string): PluginAnalysis => {
    const config = read_plugin_config(root_dir);

    if (!fs.existsSync(path.join(root_dir, "node_modules"))) {
        throw new Error("No node_modules, run npm ci first");
    }

    const {packages, missing} = collect_runtime_packages(root_dir, config.external_names);

    if (missing.length > 0) {
        throw new Error(`These dependencies aren't installed, run npm ci first:\n  ${missing.join("\n  ")}`);
    }

    const platform_packages = [...packages.values()].filter((record) => record.platform_reason !== null);
    const lockfile_platform_packages = os_restricted_in_lockfile(root_dir, config.external_names);

    return {config, packages, platform_packages, lockfile_platform_packages};
}

const is_platform_specific = (analysis: PluginAnalysis): boolean => {
    return analysis.platform_packages.length > 0 || analysis.lockfile_platform_packages.length > 0;
}

/**
 * The targets the plugin needs building for, as a github actions matrix (just "any" for a plugin that's the same on every platform),
 * and the node version to build them with.
 */
export const plan = (root_dir: string): BuildPlan => {
    const analysis = analyse_plugin(root_dir);
    const targets = is_platform_specific(analysis) ? analysis.config.targets : [ANY_TARGET];

    return {
        matrix: {
            include: targets.map((target) => ({target, runner: runner_for_target(target)}))
        },
        node_version: NODE_MAJOR
    };
}

/**
 * The names the plugin's entry exports, which are its plugins' names.<br>
 * Read statically from an ESM build, so nothing in the plugin runs. A CommonJS entry only shows "default" this way,
 * so its names are read by loading the bundle instead.
 */
const read_export_names = async (entry_path: string, root_dir: string, bundle_path: string): Promise<string[]> => {
    try {
        const probe = await esbuild.build({
            entryPoints: [entry_path],
            absWorkingDir: root_dir,
            bundle: true,
            platform: "node",
            format: "esm",
            target: NODE_TARGET,
            packages: "external",
            write: false,
            metafile: true,
            outfile: "export-probe.mjs",
            logLevel: "silent"
        });

        const export_names = Object.values(probe.metafile.outputs)[0].exports.filter((name) => name !== "default");

        if (export_names.length > 0) {
            return export_names;
        }
    } catch {
        // falls back to loading the bundle below
    }

    const loaded_names = execFileSync(process.execPath, [
        "-e",
        "console.log(JSON.stringify(Object.keys(require(process.argv[1]))))",
        bundle_path
    ], {encoding: "utf-8"});

    return (JSON.parse(loaded_names) as string[]).filter((name) => name !== "default");
}

// runs in its own node process, so loading the plugins can't affect this one
// writes what a plugin browser shows about each plugin to info_path, as it's only known once they're loaded
const VERIFY_SCRIPT = `
    const fs = require("fs");
    const path = require("path");
    const [package_dir, info_path, types_path] = process.argv.slice(1);
    const find_plugin_problems = types_path ? require(types_path).find_plugin_problems : null;

    const string_or_null = (value) => typeof value === "string" ? value : null;

    const plugin_package = require(package_dir);
    const plugin_names = Object.keys(plugin_package);
    if (plugin_names.length === 0) {
        throw new Error("The package exports no plugins");
    }

    const problems = [];
    const plugin_infos = [];
    for (const plugin_name of plugin_names) {
        const plugin = require(path.join(package_dir, plugin_name)).default;

        if (plugin !== plugin_package[plugin_name]) {
            problems.push(plugin_name + ": its folder doesn't load the same plugin as the package");
        }

        for (const problem of find_plugin_problems ? find_plugin_problems(plugin) : []) {
            problems.push(plugin_name + ": " + problem);
        }

        const config_template = plugin && typeof plugin.config_template === "object" ? plugin.config_template : {};
        const live_controls = Array.isArray(plugin?.live?.controls) ? plugin.live.controls : [];

        plugin_infos.push({
            key: plugin_name,
            display_name: string_or_null(plugin?.display_name),
            description: string_or_null(plugin?.description),
            pushable: typeof plugin?.handle_push === "function",
            live_controls: live_controls.filter((control) => typeof control === "string"),
            config_fields: Object.entries(config_template).map(([name, field]) => ({name, description: string_or_null(field?.description)}))
        });
    }

    if (problems.length > 0) {
        throw new Error("Plugin problems:\\n  " + problems.join("\\n  "));
    }

    fs.writeFileSync(info_path, JSON.stringify(plugin_infos));
    console.log("Loaded " + plugin_names.length + " plugin(s): " + plugin_names.join(", "));
`;

/**
 * Loads the built package like the server does, checking every plugin can be required through its own folder,
 * and runs @pi-tray/types' checks on each if the plugin has it installed.
 * @returns what a plugin browser shows about each plugin
 */
const verify_package = (package_dir: string, root_dir: string, info_path: string): PluginInfo[] => {
    let types_path = "";
    try {
        types_path = createRequire(path.join(root_dir, "package.json")).resolve("@pi-tray/types");
    } catch {
        console.log("@pi-tray/types isn't installed, so only checking the plugins load");
    }

    execFileSync(process.execPath, ["-e", VERIFY_SCRIPT, package_dir, info_path, types_path], {stdio: "inherit"});
    return read_json<PluginInfo[]>(info_path);
}

// npm allows "Name <email> (url)" or {name, email, url}, a browser only wants the name
const author_name = (author: unknown): string | null => {
    if (typeof author === "string") {
        return author.split(/[<(]/)[0].trim() || null;
    }

    const name = (author as {name?: unknown} | undefined)?.name;
    return typeof name === "string" ? name : null;
}

// npm allows "owner/repo", "github:owner/repo", git urls, or {type, url}. a browser wants a link it can open
const repository_url = (repository: unknown): string | null => {
    const raw = typeof repository === "string" ? repository : (repository as {url?: unknown} | undefined)?.url;

    if (typeof raw !== "string") {
        return null;
    }

    const shorthand = raw.match(/^(?:github:)?([\w.-]+\/[\w.-]+)$/);
    if (shorthand) {
        return `https://github.com/${shorthand[1]}`;
    }

    return raw
        .replace(/^git\+/, "")
        .replace(/^git@github\.com:/, "https://github.com/")
        .replace(/^git:\/\//, "https://")
        .replace(/\.git$/, "");
}

/**
 * The @pi-tray/types version the plugin is built against. Read from the installed copy, as its exports hide its package.json from require.
 */
const installed_api_version = (root_dir: string): string | null => {
    const types_manifest_path = path.join(root_dir, "node_modules", "@pi-tray", "types", "package.json");
    return fs.existsSync(types_manifest_path) ? read_json<PackageManifest>(types_manifest_path).version ?? null : null;
}

const read_metadata = (manifest: PackageManifest, root_dir: string): PackageMetadata => ({
    description: manifest.description || null,
    author: author_name(manifest.author),
    license: manifest.license ?? null,
    repository: repository_url(manifest.repository),
    homepage: manifest.homepage ?? null,
    api_version: installed_api_version(root_dir)
});

const sha256_of_file = (file_path: string): string => createHash("sha256").update(fs.readFileSync(file_path)).digest("hex");

const archive_base_name = (package_name: string, version: string, target: string): string => {
    // @pi-tray/discord -> pi-tray-discord, like npm pack names its tarballs
    const flat_name = package_name.replace(/^@/, "").replace(/\//g, "-");
    return `${flat_name}-${version}-${target}`;
}

/**
 * Works out the target to build: "any" if every package is the same on every platform, otherwise this machine's, as npm ci installed them for it.
 */
const resolve_target = (analysis: PluginAnalysis, requested_target: string | undefined): string => {
    const {config, platform_packages, lockfile_platform_packages} = analysis;

    if (!is_platform_specific(analysis)) {
        if (requested_target && requested_target !== ANY_TARGET) {
            console.log(`Nothing depends on the platform, so building for any platform instead of ${requested_target}`);
        }

        return ANY_TARGET;
    }

    const target = requested_target ?? host_target();

    if (target !== host_target()) {
        throw new Error(`Platform-specific packages can only be built for this machine (${host_target()}), not ${target}. Build ${target} on a ${target} runner`);
    }

    // npm ci compiled any native modules (and ran install scripts) with the node running this, which has to be the node the server runs them on
    const running_major = Number(process.versions.node.split(".")[0]);
    if (running_major !== NODE_MAJOR) {
        throw new Error(`Building with node ${process.versions.node}, but the server runs node ${NODE_MAJOR}, so what npm ci built may not load there. Use node ${NODE_MAJOR} and run npm ci again`);
    }

    if (!config.targets.includes(target)) {
        throw new Error(`${target} isn't one of this plugin's targets (${config.targets.join(", ")})`);
    }

    // a package like koffi or esbuild has a platform package for every platform, so the ones for other platforms are only counted
    const installed_names = new Set(platform_packages.map((record) => record.name));
    const other_platform_packages = lockfile_platform_packages.filter((name) => !installed_names.has(name));

    const descriptions = platform_packages.map((record) => `${record.name}@${record.version} (${record.platform_reason})`);
    if (other_platform_packages.length > 0) {
        descriptions.push(other_platform_packages.length <= 3
            ? `${other_platform_packages.join(", ")} (only installed on other platforms)`
            : `${other_platform_packages.length} packages only installed on other platforms, e.g. ${other_platform_packages[0]}`);
    }

    console.log(`Platform-specific packages: ${descriptions.join(", ")}`);
    return target;
}

/**
 * Builds the plugin for one target into <out_dir>/<name>-<version>-<target>.tgz, with a .json describing it for the manifest.<br>
 * The archive holds a package folder the server can load from plugin-env as it is:
 * - index.js: the plugin's own code, bundled into one file
 * - <plugin name>/index.js: one per exported plugin, pointing at index.js, so "<package>/<plugin>" loads like before
 * - node_modules: its runtime dependencies, exactly as npm installed them on this machine
 * - package.json: name, version, and the target and node version it was built for
 */
export const build = async (root_dir: string, options: BuildOptions): Promise<ArchiveInfo> => {
    const analysis = analyse_plugin(root_dir);
    const {config, packages} = analysis;
    const {manifest} = config;

    // platform-specific packages were installed by npm ci on the machine running this, so only this machine's target can be built
    const target = resolve_target(analysis, options.target);

    const out_dir = path.resolve(root_dir, options.out_dir);
    const staging_dir = path.join(out_dir, `.staging-${target}`);
    const package_dir = path.join(staging_dir, "package");

    fs.rmSync(staging_dir, {recursive: true, force: true});
    fs.mkdirSync(package_dir, {recursive: true});

    try {
        const bundle_path = path.join(package_dir, "index.js");

        await esbuild.build({
            entryPoints: [config.entry_path],
            absWorkingDir: root_dir,
            outfile: bundle_path,
            bundle: true,
            platform: "node",
            format: "cjs",
            target: NODE_TARGET,
            // dependencies stay as require() calls, loaded from node_modules
            packages: "external",
            // readable stack traces in the server's logs
            keepNames: true,
            logLevel: "warning"
        });

        // every dependency ships as a folder in npm's layout, rather than being bundled, which breaks any that read their
        // own files (through __dirname or import.meta.url). copied before reading export names, as a CommonJS entry is loaded to read them
        for (const source_dir of packages.keys()) {
            fs.cpSync(source_dir, path.join(package_dir, path.relative(root_dir, source_dir)), {
                recursive: true,
                dereference: true,
                // nested dependencies are copied as packages of their own, if they're needed
                filter: (source_path) => path.relative(source_dir, source_path).split(path.sep)[0] !== "node_modules"
            });
        }

        if (target !== ANY_TARGET) {
            const removed_bytes = prune_other_targets(path.join(package_dir, "node_modules"), target);

            if (removed_bytes > 0) {
                console.log(`Removed ${describe_bytes(removed_bytes)} of other platforms' binaries`);
            }
        }

        const plugin_names = await read_export_names(config.entry_path, root_dir, bundle_path);

        if (plugin_names.length === 0) {
            throw new Error(`${path.relative(root_dir, config.entry_path)} doesn't export any plugins`);
        }

        for (const plugin_name of plugin_names) {
            if (!PLUGIN_NAME_PATTERN.test(plugin_name) || RESERVED_PLUGIN_NAMES.has(plugin_name)) {
                throw new Error(`"${plugin_name}" can't be a plugin name, use letters, numbers, _, - and $`);
            }

            const plugin_dir = path.join(package_dir, plugin_name);
            fs.mkdirSync(plugin_dir, {recursive: true});
            fs.writeFileSync(
                path.join(plugin_dir, "index.js"),
                `// loads the plugin from the package's bundle, so "${manifest.name}/${plugin_name}" works like an unbundled package\n` +
                `module.exports.default = require("../index.js")[${JSON.stringify(plugin_name)}];\n`
            );
        }

        for (const file_name of fs.readdirSync(root_dir)) {
            if (COPIED_ROOT_FILES.test(file_name)) {
                fs.copyFileSync(path.join(root_dir, file_name), path.join(package_dir, file_name));
            }
        }

        const metadata = read_metadata(manifest, root_dir);

        // no dependencies or scripts, so nothing ever installs or builds anything on the user's machine
        const archive_manifest = {
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            license: manifest.license,
            main: "index.js",
            "pi-tray": {
                target,
                plugins: plugin_names,
                node_version: process.versions.node,
                node_abi: process.versions.modules,
                api_version: metadata.api_version,
                built_by: `@pi-tray/plugin-build@${TOOL_VERSION}`
            }
        };
        fs.writeFileSync(path.join(package_dir, "package.json"), JSON.stringify(archive_manifest, null, 2) + "\n");

        // outside the package folder, so it isn't archived
        const plugins = options.verify ? verify_package(package_dir, root_dir, path.join(staging_dir, "plugins.json")) : null;

        const base_name = archive_base_name(manifest.name, manifest.version, target);
        const archive_path = path.join(out_dir, `${base_name}.tgz`);

        await create_tar({gzip: true, file: archive_path, cwd: staging_dir, portable: true}, ["package"]);

        const archive_info: ArchiveInfo = {
            name: manifest.name,
            version: manifest.version,
            target,
            file: path.basename(archive_path),
            sha256: sha256_of_file(archive_path),
            size: fs.statSync(archive_path).size,
            node_abi: process.versions.modules,
            metadata,
            plugins
        };
        fs.writeFileSync(path.join(out_dir, `${base_name}.json`), JSON.stringify(archive_info, null, 2) + "\n");

        console.log(`Built ${path.relative(root_dir, archive_path)} (${describe_bytes(archive_info.size)})`);
        return archive_info;
    } finally {
        fs.rmSync(staging_dir, {recursive: true, force: true});
    }
}
