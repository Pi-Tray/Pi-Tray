import {ChevronRight} from "lucide-react";

import {PackagePlugins, remove_package, usePluginIndex} from "../util/plugins.ts";

interface TableRowProps {
    package_plugins: PackagePlugins;
}

const TableRow = ({package_plugins}: TableRowProps) => {
    const plugin_count = package_plugins.plugins.length;

    return (
        <tr className="*:align-top">
            <td>
                <div className="font-medium leading-5">{package_plugins.package_name}</div>
                <div className="text-xs opacity-60">{package_plugins.installed.version} · {package_plugins.installed.source}</div>
                <button className="btn btn-ghost btn-xs mt-1" onClick={async () => {
                    if (!confirm(`Remove ${package_plugins.package_name}? Its saved data is kept, so reinstalling it keeps its settings.`)) {
                        return;
                    }

                    try {
                        await remove_package(package_plugins.package_name);
                    } catch (error) {
                        alert(`Couldn't remove it: ${error instanceof Error ? error.message : String(error)}`);
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
        </tr>
    );
}

/**
 * Lists installed plugin packages with the plugins they provide.<br>
 * Updates the list by itself when packages are installed or removed, as the plugin index watches the plugin folder.
 * @returns the element
 */
export const PluginTable = () => {
    const plugin_index = usePluginIndex();

    return (
        <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Packages</h2>

            {plugin_index === null && <p className="opacity-70">Indexing plugins...</p>}
            {plugin_index !== null && plugin_index.length === 0 && <p className="opacity-70">No plugin packages installed.</p>}

            {plugin_index !== null && plugin_index.length > 0 && (
                <table className="table table-sm">
                    <thead>
                    <tr>
                        <th>Package</th>
                    </tr>
                    </thead>

                    <tbody>
                    {plugin_index.map(package_plugins => (
                        <TableRow key={package_plugins.package_name} package_plugins={package_plugins} />
                    ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
