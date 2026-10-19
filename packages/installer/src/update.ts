import {InstalledRegistry, read_installed} from "./installed";
import {parse_spec} from "@pi-tray/package-spec";
import {resolve_package, ResolvedPackage} from "./resolve";
import semver from "semver";

export interface UpdateCheckResult {
    name: string;
    installed_version: string | null;
    latest_version: string | null;
    status: "update_available" | "up_to_date" | "pinned" | "local" | "error";
    error?: string;
}

interface FoundUpdate {
    result: UpdateCheckResult;
    resolved?: ResolvedPackage;
}

const find_update = async (name: string, installed: InstalledRegistry): Promise<FoundUpdate> => {
    const entry = installed.packages[name];

    if (!entry) {
        return {
            result: {
                name,
                installed_version: null,
                latest_version: null,
                status: "error",
                error: "Package not installed"
            }
        };
    }

    if (entry.pinned) {
        return {
            result: {
                name,
                installed_version: entry.version,
                latest_version: entry.version,
                status: "pinned"
            }
        };
    }

    const parse = parse_spec(entry.source);
    if (!parse.ok) {
        return {
            result: {
                name,
                installed_version: entry.version,
                latest_version: null,
                status: "error",
                error: `Invalid source spec ${entry.source}: ${parse.error}`
            }
        };
    }

    const {source} = parse;

    if (source.kind === "file") {
        return {
            result: {
                name,
                installed_version: entry.version,
                latest_version: entry.version,
                status: "local"
            }
        };
    }

    try {
        const resolved = await resolve_package(source);

        // if both semver versions are valid, use greater-than comparison, otherwise just check for equality
        const newer = semver.valid(resolved.version) && semver.valid(entry.version)
            ? semver.gt(resolved.version, entry.version)
            : resolved.version !== entry.version;

        return {
            result: {
                name,
                installed_version: entry.version,
                latest_version: resolved.version,
                status: newer ? "update_available" : "up_to_date"
            },
            resolved: newer ? resolved : undefined
        };
    } catch (error) {
        return {
            result: {
                name,
                installed_version: entry.version,
                latest_version: null,
                status: "error",
                error: error instanceof Error ? error.message : String(error)
            }
        };
    }
}

export const check_update = async (name: string, installed = read_installed()): Promise<UpdateCheckResult> => {
    const found = await find_update(name, installed);
    return found.result;
}

export const check_updates = async (names?: string[]): Promise<UpdateCheckResult[]> => {
    const installed = read_installed();

    // if names not specified, check all installed packages
    if (names === undefined) {
        names = Object.keys(installed.packages);
    }

    const result_promises = names.map((name) => check_update(name, installed));
    return Promise.all(result_promises);
}
