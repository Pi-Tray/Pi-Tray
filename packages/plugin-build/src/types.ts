/**
 * The parts of a package.json this tool reads, from the plugin or from an installed package.
 */
export interface PackageManifest {
    name?: string;
    version?: string;
    description?: string;
    author?: unknown;
    license?: string;
    repository?: unknown;
    homepage?: string;
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    os?: string[];
    cpu?: string[];
    gypfile?: boolean;
    binary?: unknown;
    "pi-tray"?: unknown;
}

/**
 * An installed package the plugin needs at runtime.
 */
export interface PackageRecord {
    name: string;
    version: string;

    /** Where npm installed it, e.g. <plugin>/node_modules/koffi */
    dir: string;

    /** Whether it has a native module (or loads one from a platform package), so the plugin is built per platform */
    native: boolean;

    /** Whether it's for one platform only (it has "os" or "cpu"), e.g. @koromix/koffi-win32-x64 */
    platform_specific: boolean;

    /** The folders of the installed packages it depends on */
    children: string[];
}

/**
 * The plugin's build settings, from the "pi-tray" field of its package.json.
 */
export interface PluginConfig {
    manifest: PackageManifest & {name: string, version: string};
    entry_path: string;
    external_names: Set<string>;
    targets: string[];
}

/**
 * One plugin in a package, as a plugin browser shows it before it's installed. Read from the loaded plugin when it's built.
 */
export interface PluginInfo {
    /** The name it's exported as, so it's referenced as <package>/<key> */
    key: string;
    display_name: string | null;
    description: string | null;

    /** Whether pressing it does anything, rather than only showing something */
    pushable: boolean;

    /** What its live tile updates, e.g. ["label"], or empty if it isn't live */
    live_controls: string[];

    /** The settings it takes, from its config template */
    config_fields: {name: string, description: string | null}[];
}

/**
 * The package's details for a plugin browser, from its package.json.
 */
export interface PackageMetadata {
    description: string | null;
    author: string | null;
    license: string | null;
    repository: string | null;
    homepage: string | null;

    /** The @pi-tray/types version it was built against, i.e. the plugin api it uses */
    api_version: string | null;
}

/**
 * One built archive, written next to it as <archive>.json and combined into the manifest.
 */
export interface ArchiveInfo {
    name: string;
    version: string;
    target: string;
    file: string;
    sha256: string;
    size: number;
    node_abi: string;
    metadata: PackageMetadata;

    /** Null if it was built with --skip-verify, which doesn't load the plugins */
    plugins: PluginInfo[] | null;
}

/**
 * The manifest the installer reads to pick the archive for its platform, which also describes the release for a plugin browser.
 */
export interface PluginManifest extends PackageMetadata {
    name: string;
    version: string;
    published_at: string;
    release_notes_url: string | null;

    /** The targets with an archive, ["any"] for a plugin without native modules */
    platforms: string[];

    plugins: PluginInfo[] | null;
    targets: Record<string, {url: string, sha256: string, size: number, node_abi: string}>;
}

/**
 * What the release workflow needs: a GitHub actions matrix with one entry per target, and the node to build with.
 */
export interface BuildPlan {
    matrix: {include: {target: string, runner: string}[]};

    /** The node major the server ships with, so native modules are compiled for it */
    node_version: number;
}
