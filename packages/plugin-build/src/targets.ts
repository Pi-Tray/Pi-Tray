// the platforms a plugin is built for, and the github runner that builds each one
// platform-specific packages are installed on their own platform, so every target needs a runner of that platform and cpu

export const ANY_TARGET = "any";

/**
 * Every target a platform-specific plugin is built for, unless its package.json lists its own "targets".
 */
export const DEFAULT_TARGETS: readonly string[] = [
    "win32-x64",
    "win32-arm64",
    "darwin-x64",
    "darwin-arm64",
    "linux-x64",
    "linux-arm64"
];

const RUNNERS: Record<string, string> = {
    "win32-x64": "windows-latest",
    "win32-arm64": "windows-11-arm",
    "darwin-x64": "macos-15-intel",
    "darwin-arm64": "macos-latest",
    "linux-x64": "ubuntu-latest",
    "linux-arm64": "ubuntu-24.04-arm",
    [ANY_TARGET]: "ubuntu-latest"
};

/**
 * The github runner that builds a target.
 * @throws for a target there's no runner for
 */
export const runner_for_target = (target: string): string => {
    const runner = RUNNERS[target];

    if (!runner) {
        throw new Error(`No runner to build ${target} on. Known targets: ${Object.keys(RUNNERS).join(", ")}`);
    }

    return runner;
}

/**
 * The target this machine builds, e.g. win32-x64.
 */
export const host_target = (): string => `${process.platform}-${process.arch}`;

/**
 * Splits a target into its platform and cpu, e.g. win32-x64 into {platform: "win32", arch: "x64"}.
 */
export const parse_target = (target: string): {platform: string, arch: string} => {
    const separator_index = target.indexOf("-");

    if (separator_index === -1) {
        throw new Error(`Target ${target} should look like <platform>-<arch>, e.g. win32-x64`);
    }

    return {
        platform: target.slice(0, separator_index),
        arch: target.slice(separator_index + 1)
    };
}
