import {useEffect, useMemo, useRef, useState} from "react";

import {Activity, Search, Settings2, X} from "lucide-react";

import {IndexedPlugin, usePluginIndex} from "../util/plugins";
import {PluginDescription} from "./PluginDescription";

interface PluginPickerDialogProps {
    open: boolean;
    onClose: () => void;
    onPick: (plugin_name: string) => void;
    current?: string | null;
}

const plugin_matches = (plugin: IndexedPlugin, query_terms: string[]) => {
    const searchable_text = `${plugin.display_name} ${plugin.name} ${plugin.description ?? ""}`.toLowerCase();
    return query_terms.every(term => searchable_text.includes(term));
}

/**
 * A searchable dialog for choosing a plugin, grouped by the package that provides it.
 * @param open whether the dialog is shown
 * @param onClose called when the dialog closes, must be stable (e.g. from useCallback)
 * @param onPick called with the chosen plugin's full name, then the dialog closes
 * @param current the currently chosen plugin's full name, highlighted in the list
 * @returns the element
 */
export const PluginPickerDialog = ({open, onClose, onPick, current}: PluginPickerDialogProps) => {
    const dialog_ref = useRef<HTMLDialogElement>(null);
    const search_ref = useRef<HTMLInputElement>(null);

    const plugin_index = usePluginIndex();
    const [query, setQuery] = useState("");

    // sync open state, guarded so a re-render while open doesn't reset the search or re-open the dialog
    useEffect(() => {
        const dialog = dialog_ref.current;
        if (!dialog) {
            return;
        }

        if (open && !dialog.open) {
            setQuery("");
            dialog.showModal();
            search_ref.current?.focus();
        } else if (!open && dialog.open) {
            dialog.close();
        }

        dialog.addEventListener("close", onClose);
        return () => dialog.removeEventListener("close", onClose);
    }, [open, onClose]);

    // packages with their matching plugins, leaving out packages with no matches
    const filtered_packages = useMemo(() => {
        if (!plugin_index) {
            return null;
        }

        const query_terms = query.toLowerCase().split(/\s+/).filter(Boolean);

        return plugin_index
            .map(package_plugins => ({
                ...package_plugins,
                plugins: package_plugins.plugins.filter(plugin => plugin_matches(plugin, query_terms))
            }))
            .filter(package_plugins => package_plugins.plugins.length > 0);
    }, [plugin_index, query]);

    const first_match = filtered_packages?.[0]?.plugins[0];

    const pick = (plugin_name: string) => {
        onPick(plugin_name);
        onClose();
    };

    return (
        <dialog ref={dialog_ref} className="modal">
            <div className="modal-box w-2xl max-w-2xl h-[80vh] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Choose a plugin</h3>

                    <form method="dialog">
                        <button className="btn btn-ghost btn-sm btn-square" title="Close dialog">
                            <X className="w-5 h-5" />
                        </button>
                    </form>
                </div>

                <label className="input input-bordered w-full">
                    <Search className="w-4 h-4 opacity-60" />
                    <input
                        ref={search_ref}
                        type="search"
                        placeholder="Search plugins"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        onKeyDown={event => {
                            // enter picks the top result
                            if (event.key === "Enter" && first_match) {
                                event.preventDefault();
                                pick(first_match.name);
                            }
                        }}
                    />
                </label>

                <div className="flex-1 overflow-y-auto -mx-2 px-2">
                    {filtered_packages === null && (
                        <div className="flex h-full items-center justify-center">
                            <span className="loading loading-spinner opacity-60" />
                        </div>
                    )}

                    {filtered_packages !== null && filtered_packages.length === 0 && (
                        <p className="opacity-70">
                            {query ? `No plugins match "${query}".` : "No plugins installed. Add some from the Plugins page."}
                        </p>
                    )}

                    {filtered_packages?.map(package_plugins => (
                        <section key={package_plugins.package_name} className="mb-4">
                            <h4 className="sticky top-0 z-10 bg-base-100/90 py-1 font-mono text-xs text-base-content/80">{package_plugins.package_name}</h4>

                            <ul role="listbox" aria-label={package_plugins.package_name} className="mt-1 flex flex-col gap-1">
                                {package_plugins.plugins.map(plugin => {
                                    const selected = plugin.name === current;

                                    return (
                                        <li
                                            key={plugin.name}
                                            role="option"
                                            aria-selected={selected}
                                            tabIndex={0}
                                            onClick={event => {
                                                // links in the description open in the browser rather than picking the plugin
                                                if (!(event.target as HTMLElement).closest("a")) {
                                                    pick(plugin.name);
                                                }
                                            }}
                                            onKeyDown={event => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    pick(plugin.name);
                                                }
                                            }}
                                            className={`flex cursor-pointer flex-col gap-0.5 rounded-box px-3 py-2 hover:bg-base-200 focus-visible:bg-base-200 focus-visible:outline-none ${selected ? "bg-primary/10 ring-1 ring-primary" : ""}`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{plugin.display_name}</span>

                                                {plugin.configurable && (
                                                    <span className="badge badge-ghost badge-sm gap-1" title="Has settings to configure">
                                                        <Settings2 className="w-3 h-3" />
                                                        Configurable
                                                    </span>
                                                )}

                                                {plugin.live && (
                                                    <span className="badge badge-soft badge-accent badge-sm gap-1" title="Updates its button live, e.g. to show a value">
                                                        <Activity className="w-3 h-3" />
                                                        Live
                                                    </span>
                                                )}
                                            </div>

                                            <span className="font-mono text-xs opacity-60">{plugin.name}</span>

                                            {plugin.description && <PluginDescription>{plugin.description}</PluginDescription>}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </div>
            </div>
        </dialog>
    );
}
