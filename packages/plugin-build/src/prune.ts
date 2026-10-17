import fs from "fs";
import path from "path";

import {parse_target} from "./targets";

type FolderMatcher = (folder_name: string, platform: string, arch: string) => boolean;

// prebuildify names its folders <platform>-<arch>, joining several archs with + for universal binaries, e.g. darwin-x64+arm64
const prebuilds_folder_matches: FolderMatcher = (folder_name, platform, arch) => {
    const separator_index = folder_name.indexOf("-");

    // not a layout we know, so keep it
    if (separator_index === -1) {
        return true;
    }

    const folder_platform = folder_name.slice(0, separator_index);
    const folder_archs = folder_name.slice(separator_index + 1).split("+");

    return folder_platform === platform && folder_archs.includes(arch);
}

// koffi 2 keeps every build in one package, as build/koffi/<platform>_<arch>, with musl_<arch> for alpine
const koffi_folder_matches: FolderMatcher = (folder_name, platform, arch) => {
    return folder_name === `${platform}_${arch}` || (platform === "linux" && folder_name === `musl_${arch}`);
}

const folder_size = (dir: string): number => {
    let total = 0;

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const entry_path = path.join(dir, entry.name);
        total += entry.isDirectory() ? folder_size(entry_path) : fs.statSync(entry_path).size;
    }

    return total;
}

const remove_other_targets = (dir: string, folder_matches: FolderMatcher, platform: string, arch: string): number => {
    let removed_bytes = 0;

    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        if (entry.isDirectory() && !folder_matches(entry.name, platform, arch)) {
            const entry_path = path.join(dir, entry.name);
            removed_bytes += folder_size(entry_path);
            fs.rmSync(entry_path, {recursive: true, force: true});
        }
    }

    return removed_bytes;
}

/**
 * Deletes the binaries for other platforms from packages that ship every platform's build, as each archive is for one target.
 * @param node_modules_dir the archive's node_modules folder
 * @param target the archive's target, e.g. win32-x64
 * @returns how many bytes were removed
 */
export const prune_other_targets = (node_modules_dir: string, target: string): number => {
    const {platform, arch} = parse_target(target);
    let removed_bytes = 0;

    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
            if (!entry.isDirectory()) {
                continue;
            }

            const entry_path = path.join(dir, entry.name);

            if (entry.name === "prebuilds") {
                removed_bytes += remove_other_targets(entry_path, prebuilds_folder_matches, platform, arch);
            } else if (entry.name === "koffi" && path.basename(dir) === "build") {
                removed_bytes += remove_other_targets(entry_path, koffi_folder_matches, platform, arch);
            } else {
                walk(entry_path);
            }
        }
    }

    if (fs.existsSync(node_modules_dir)) {
        walk(node_modules_dir);
    }

    return removed_bytes;
}
