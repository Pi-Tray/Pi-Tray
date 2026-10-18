import {read_installed, InstalledPackage} from "./installed";

export * from "./read";
export {host_target, resolve_archive, resolve_package} from "./resolve";
export type {ArchiveLocation, ArchiveOrigin, ManifestTarget, RemoteManifest, ResolvedPackage} from "./resolve";
export {install_package, parse_install_spec} from "./install";
export type {InstallOptions, InstallResult} from "./install";
export {remove_package} from "./remove";
export type {RemoveOptions, RemoveResult} from "./remove";
export {ensure_bundled_packages} from "./bundled";
export type {BundledOutcome, BundledPackage} from "./bundled";

/**
 * Every installed package, sorted by name.
 */
export const list_packages = (): (InstalledPackage & {name: string})[] => {
    return Object.entries(read_installed().packages)
        .map(([name, installed]) => ({name, ...installed}))
        .sort((first, second) => first.name.localeCompare(second.name));
}
