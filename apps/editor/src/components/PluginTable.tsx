import {useCallback, useEffect, useState} from "react";

import {ChevronRight, RefreshCw} from "lucide-react";

import {
    check_package_updates,
    PackagePlugins,
    remove_package,
    update_packages,
    UpdateCheckResult,
    UpdateResult,
    usePluginIndex
} from "../util/plugins.ts";
import {show_alert, show_confirm} from "../util/dialogs.ts";
import {useSupervisor} from "../contexts/SupervisorProvider";

// name (1.25rem) + source (1rem) + gap (0.25rem) + remove button (1.5rem)
const HEADER_HEIGHT = "flex h-16 items-center";

// after stopping the server, windows takes a moment to let go of its native modules once the process has exited
const IN_USE_RETRY_ATTEMPTS = 5;
const IN_USE_RETRY_DELAY_MS = 1000;

const wait = (delay_ms: number) => new Promise((resolve) => setTimeout(resolve, delay_ms));

interface TableRowProps {
    package_plugins: PackagePlugins;

    /**
     * Its update status, or undefined if it hasn't been checked yet, e.g. installed since the last check.
     */
    status: UpdateCheckResult | undefined;

    busy: boolean;
    updating: boolean;
    run_updates: (names: string[]) => Promise<void>;
}

const TableRow = ({package_plugins, status, busy, updating, run_updates}: TableRowProps) => {
    const plugin_count = package_plugins.plugins.length;

    return (
        <tr className="*:align-top">
            <td>
                {/* every line has a fixed rem height so the collapsed header is exactly HEADER_HEIGHT tall */}
                <div className="font-medium leading-5">{package_plugins.package_name}</div>
                <div className="text-xs leading-4 opacity-60">{package_plugins.installed.source}</div>
                <button className="btn btn-ghost btn-xs mt-1" disabled={busy} onClick={async () => {
                    const confirmed = await show_confirm({
                        title: "Remove package",
                        message: `Remove ${package_plugins.package_name}? Its saved data is kept, so reinstalling it keeps its settings.`,
                        confirm_label: "Remove",
                        tone: "danger"
                    });
                    if (!confirmed) {
                        return;
                    }

                    try {
                        await remove_package(package_plugins.package_name);
                    } catch (error) {
                        show_alert(`Couldn't remove it: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }}>Remove</button>

                {package_plugins.error && (
                    <div className="mt-1 flex h-6 items-center text-xs text-warning" title={package_plugins.error}>Couldn't read plugins</div>
                )}

                {!package_plugins.error && plugin_count === 0 && (
                    <div className="mt-1 flex h-6 items-center text-xs opacity-60">No plugins</div>
                )}

                {!package_plugins.error && plugin_count > 0 && (
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
                <div className={HEADER_HEIGHT}>{package_plugins.installed.version}</div>
            </td>
            <td className="font-mono text-xs">
                <div className={HEADER_HEIGHT}>{status?.latest_version ?? "-"}</div>
            </td>
            <td>
                <div className={`${HEADER_HEIGHT} justify-end`}>
                    {!status && <span className="text-xs opacity-60">Not checked</span>}

                    {status?.status === "error" && <span className="text-xs text-warning" title={status.error}>{status.error}</span>}

                    {status?.status === "up_to_date" && <span className="text-xs opacity-60">Up to date</span>}

                    {status?.status === "pinned" && (
                        <span className="text-xs opacity-60" title="Installed from a specific release, install it again without one to get updates">
                            Pinned
                        </span>
                    )}

                    {status?.status === "local" && <span className="text-xs opacity-60" title="Installed from a file, so there's nowhere to check">Local file</span>}

                    {status?.status === "update_available" && (
                        <button className="btn btn-xs btn-primary" disabled={busy} onClick={() => run_updates([status.name])}>
                            {updating ? <span className="loading loading-spinner loading-xs" /> : "Update"}
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

const describe_failures = (results: UpdateResult[]): string | null => {
    const failed = results.filter(result => result.status === "error" || result.status === "in_use");

    if (failed.length === 0) {
        return null;
    }

    return failed.map(result => `${result.name}: ${result.error ?? "couldn't be updated"}`).join("\n");
}

/**
 * Lists installed plugin packages with their update status and the plugins they provide, and lets the user update or remove them.<br>
 * Updates the list by itself when packages are installed or removed, as the plugin index watches the plugin folder.
 * @returns the element
 */
export const PluginTable = () => {
    const plugin_index = usePluginIndex();
    const supervisor = useSupervisor();

    const [statuses, setStatuses] = useState<UpdateCheckResult[] | null>(null);
    const [checking, setChecking] = useState(false);

    // installs hold a lock, so only one batch of updates runs at a time
    const [updating_names, setUpdatingNames] = useState<string[]>([]);

    const check = useCallback(
        async () => {
            setChecking(true);

            try {
                setStatuses(await check_package_updates());
            } catch (error) {
                console.error("Failed to check for plugin updates:", error);
            }

            setChecking(false);
        },
        []
    );

    // check once when opened, then whenever asked or after updating
    useEffect(() => {
        void check();
    }, [check]);

    // windows won't replace a package whose native modules the server has loaded, so offer to stop it for the update
    const update_in_use = useCallback(
        async (in_use: UpdateResult[]): Promise<UpdateResult[]> => {
            if (supervisor.status?.state !== "running") {
                return in_use;
            }

            const names = in_use.map(result => result.name);

            const confirmed = await show_confirm({
                title: "Stop the server to update",
                message: `${names.join(", ")} can't be updated while the server is using ${names.length === 1 ? "it" : "them"}. `
                    + "Stop the server, update, and start it again? Your Pi will disconnect for a moment.",
                confirm_label: "Stop and update"
            });

            if (!confirmed) {
                return in_use;
            }

            await supervisor.run_action("stop");

            try {
                let results = await update_packages(names);

                for (let attempt = 1; attempt < IN_USE_RETRY_ATTEMPTS && results.some(result => result.status === "in_use"); attempt++) {
                    await wait(IN_USE_RETRY_DELAY_MS);
                    results = await update_packages(names);
                }

                return results;
            } finally {
                await supervisor.run_action("start");
            }
        },
        [supervisor]
    );

    const run_updates = useCallback(
        async (names: string[]) => {
            setUpdatingNames(names);

            try {
                const results = await update_packages(names);

                const in_use = results.filter(result => result.status === "in_use");
                const retried = in_use.length > 0 ? await update_in_use(in_use) : [];

                // the retried results replace the in use ones
                const final_results = [...results.filter(result => result.status !== "in_use"), ...retried];

                const failures = describe_failures(final_results);
                if (failures) {
                    show_alert({title: "Some packages weren't updated", message: failures});
                }
            } catch (error) {
                show_alert(`Couldn't update: ${error instanceof Error ? error.message : String(error)}`);
            }

            setUpdatingNames([]);
            await check();
        },
        [check, update_in_use]
    );

    const busy = checking || updating_names.length > 0;
    const updatable = statuses ? statuses.filter(status => status.status === "update_available") : [];

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold mr-auto">Packages</h2>

                {updatable.length > 1 && (
                    <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run_updates(updatable.map(status => status.name))}>
                        Update all ({updatable.length})
                    </button>
                )}

                <button className="btn btn-sm btn-outline" disabled={busy} onClick={check}>
                    <RefreshCw className={`w-4 h-4 ${checking ? "animate-spin" : ""}`} />
                    Check for updates
                </button>
            </div>

            {plugin_index === null && <p className="opacity-70">Indexing plugins...</p>}
            {plugin_index !== null && plugin_index.length === 0 && <p className="opacity-70">No plugin packages installed.</p>}

            {plugin_index !== null && plugin_index.length > 0 && (
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
                    {plugin_index.map(package_plugins => (
                        <TableRow
                            key={package_plugins.package_name}
                            package_plugins={package_plugins}
                            status={statuses?.find(status => status.name === package_plugins.package_name)}
                            busy={busy}
                            updating={updating_names.includes(package_plugins.package_name)}
                            run_updates={run_updates}
                        />
                    ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
