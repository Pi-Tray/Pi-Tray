import {useCallback, useEffect, useState} from "react";

import {ChevronRight, RefreshCw} from "lucide-react";

import {check_plugin_updates, PackageUpdateStatus, update_plugin_package} from "../util/plugin_updates";
import {PackagePlugins, usePluginIndex} from "../util/plugins.ts";

/**
 * Shortens commit hashes for display, leaves version numbers alone.
 */
const format_revision = (status: PackageUpdateStatus, revision: string | null) => {
    if (!revision) {
        return "?";
    }

    return status.source.kind === "github" ? revision.slice(0, 7) : revision;
}

// name (1.25rem) + spec (1rem) + gap (0.25rem) + plugins toggle (1.5rem)
const HEADER_HEIGHT = "flex h-16 items-center";

interface TableRowProps {
    status: PackageUpdateStatus;

    /**
     * The package's plugins, or undefined while the index is still loading.
     */
    package_plugins: PackagePlugins | undefined;

    busy: boolean;
    updating_name: string | null;
    update_packages: (to_update: PackageUpdateStatus[]) => Promise<void>;
}

const TableRow = ({status, package_plugins, busy, updating_name, update_packages}: TableRowProps) => {
    const plugin_count = package_plugins?.plugins.length ?? 0;

    return (
        <tr className="*:align-top">
            <td>
                {/* every line has a fixed rem height so the collapsed header is exactly HEADER_HEIGHT tall */}
                <div className="font-medium leading-5">{status.name}</div>
                <div className="text-xs leading-4 opacity-60">{status.spec}</div>

                {package_plugins === undefined && <div className="mt-1 flex h-6 items-center text-xs opacity-60">Indexing plugins...</div>}

                {package_plugins?.error && (
                    <div className="mt-1 flex h-6 items-center text-xs text-warning" title={package_plugins.error}>Couldn't read plugins</div>
                )}

                {package_plugins && !package_plugins.error && plugin_count === 0 && (
                    <div className="mt-1 flex h-6 items-center text-xs opacity-60">No plugins</div>
                )}

                {package_plugins && !package_plugins.error && plugin_count > 0 && (
                    <details className="group mt-1">
                        <summary className="flex h-6 w-fit cursor-pointer list-none items-center gap-1 rounded px-1 -ml-1 text-xs hover:bg-base-200 [&::-webkit-details-marker]:hidden">
                            <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                            {plugin_count} plugin{plugin_count === 1 ? "" : "s"}
                        </summary>

                        <ul className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-base-300 pl-3">
                            {package_plugins.plugins.map(plugin => (
                                <li key={plugin.name} className="flex flex-col">
                                    <span className="font-mono text-xs opacity-60">{plugin.name}</span>
                                    <span className="text-sm font-medium">{plugin.display_name}</span>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
            </td>

            {/* centred against the collapsed header rather than the whole row, so expanding doesn't move them */}
            <td className="font-mono text-xs">
                <div className={HEADER_HEIGHT}>{format_revision(status, status.installed)}</div>
            </td>
            <td className="font-mono text-xs">
                <div className={HEADER_HEIGHT}>{status.error ? "-" : format_revision(status, status.latest)}</div>
            </td>
            <td>
                <div className={`${HEADER_HEIGHT} justify-end`}>
                    {status.error && <span className="text-xs text-warning" title={status.error}>{status.error}</span>}

                    {!status.error && !status.update_available && <span className="text-xs opacity-60">Up to date</span>}

                    {!status.error && status.update_available && (
                        <button className="btn btn-xs btn-primary" disabled={busy} onClick={() => update_packages([status])}>
                            {updating_name === status.name ? <span className="loading loading-spinner loading-xs" /> : "Update"}
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

/**
 * Lists installed plugin packages with their update status and the plugins they provide, and lets the user update them.
 * @returns the element
 */
export const PluginTable = () => {
    const [statuses, setStatuses] = useState<PackageUpdateStatus[] | null>(null);
    const [checking, setChecking] = useState(false);

    // npm can't run two installs in the same directory at once, so only one update runs at a time
    const [updating_name, setUpdatingName] = useState<string | null>(null);

    // indexed once here and passed down, rather than every row running its own index
    const plugin_index = usePluginIndex();

    const check = useCallback(
        async () => {
            setChecking(true);

            try {
                setStatuses(await check_plugin_updates());
            } catch (error) {
                console.error("Failed to check for plugin updates:", error);
            }

            setChecking(false);
        },
        []
    );

    // check once when opened, more would burn through github's rate limit
    useEffect(() => {
        check();
    }, [check]);

    const update_packages = useCallback(
        async (to_update: PackageUpdateStatus[]) => {
            for (const status of to_update) {
                setUpdatingName(status.name);

                try {
                    await update_plugin_package(status);
                } catch (error) {
                    console.error(`Failed to update ${status.name}:`, error);
                }
            }

            setUpdatingName(null);
            await check();
        },
        [check]
    );

    const busy = checking || updating_name !== null;
    const updatable = statuses ? statuses.filter(status => status.update_available) : [];

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold mr-auto">Packages</h2>

                {updatable.length > 1 && (
                    <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => update_packages(updatable)}>
                        Update all ({updatable.length})
                    </button>
                )}

                <button className="btn btn-sm btn-outline" disabled={busy} onClick={check}>
                    <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                    Check for updates
                </button>
            </div>

            {statuses === null && <p className="opacity-70">Checking for updates...</p>}
            {statuses !== null && statuses.length === 0 && <p className="opacity-70">No plugin packages installed.</p>}

            {statuses !== null && statuses.length > 0 && (
                <table className="table table-sm">
                    <thead>
                    <tr>
                        <th>Package</th>
                        <th className="w-28">Installed</th>
                        <th className="w-28">Latest</th>
                        <th className="w-40"></th>
                    </tr>
                    </thead>

                    <tbody>
                    {statuses.map(status => (
                        <TableRow
                            key={status.name}
                            status={status}
                            package_plugins={plugin_index?.find(package_plugins => package_plugins.package_name === status.name)}
                            busy={busy}
                            updating_name={updating_name}
                            update_packages={update_packages}
                        />
                    ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
