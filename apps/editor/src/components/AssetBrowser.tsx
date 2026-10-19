import {useCallback, useEffect, useMemo, useRef, useState} from "react";

import {ImagePlus, RefreshCw, Search, Trash, Upload} from "lucide-react";

import {Asset, ASSET_ACCEPT, create_asset, delete_asset, rename_asset, replace_asset, useAssets} from "../util/assets";

// transparent images show a checkerboard behind them, like most image editors
const CHECKERBOARD = "bg-base-200 bg-[conic-gradient(var(--color-base-300)_25%,transparent_0_50%,var(--color-base-300)_0_75%,transparent_0)] bg-[length:16px_16px]";

interface Toast {
    id: number;
    message: string;
    kind: "success" | "error";
}

type ShowToast = (message: string, kind?: Toast["kind"]) => void;


const useToasts = () => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const next_id = useRef(0);

    const show_toast: ShowToast = useCallback(
        (message, kind = "success") => {
            const toast_id = next_id.current++;
            setToasts(existing => [...existing, {id: toast_id, message, kind}]);

            // errors stay longer since they usually need reading
            setTimeout(() => {
                setToasts(existing => existing.filter(toast => toast.id !== toast_id));
            }, kind === "error" ? 6000 : 3000);
        },
        []
    );

    return {toasts, show_toast};
}

const error_message = (error: unknown) => error instanceof Error ? error.message : String(error);


const useArmedConfirm = (reset_after_ms = 3000) => {
    const [armed, setArmed] = useState(false);

    useEffect(() => {
        if (!armed) {
            return;
        }

        const reset_timeout = setTimeout(() => setArmed(false), reset_after_ms);
        return () => clearTimeout(reset_timeout);
    }, [armed, reset_after_ms]);

    return {armed, arm: () => setArmed(true), disarm: () => setArmed(false)};
}

const EditableName = ({asset, show_toast}: {asset: Asset, show_toast: ShowToast}) => {
    const [editing, setEditing] = useState(false);
    const [draft_name, setDraftName] = useState(asset.name);

    const start_editing = () => {
        setDraftName(asset.name);
        setEditing(true);
    };

    const commit = () => {
        setEditing(false);

        const trimmed_name = draft_name.trim();
        if (trimmed_name === "" || trimmed_name === asset.name) {
            return;
        }

        rename_asset(asset.id, trimmed_name).catch(error => show_toast(`Couldn't rename: ${error_message(error)}`, "error"));
    };

    if (editing) {
        return (
            <input
                autoFocus
                className="input input-sm w-full"
                value={draft_name}
                onFocus={event => event.target.select()}
                onChange={event => setDraftName(event.target.value)}
                onBlur={commit}
                onKeyDown={event => {
                    if (event.key === "Enter") {
                        commit();
                    } else if (event.key === "Escape") {
                        // stops the escape also closing a surrounding dialog
                        event.stopPropagation();
                        setEditing(false);
                    }
                }}
            />
        );
    }

    return (
        <button
            type="button"
            title="Click to rename"
            onClick={start_editing}
            className="flex h-8 w-full items-center rounded px-2 text-left text-sm font-medium hover:bg-base-200 cursor-text"
        >
            {/* same height as the input, so the card doesn't jump when editing starts */}
            <span className="truncate">{asset.name}</span>
        </button>
    );
}

const ManageActions = ({asset, busy, setBusy, show_toast}: {asset: Asset, busy: boolean, setBusy: (busy: boolean) => void, show_toast: ShowToast}) => {
    const replace_input_ref = useRef<HTMLInputElement>(null);
    const delete_confirm = useArmedConfirm();

    const on_replace_chosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];

        // cleared so picking the same file again still fires a change
        event.target.value = "";

        if (!file) {
            return;
        }

        setBusy(true);

        try {
            await replace_asset(asset.id, file);
            show_toast(`Replaced "${asset.name}"`);
        } catch (error) {
            show_toast(`Couldn't replace "${asset.name}": ${error_message(error)}`, "error");
        }

        setBusy(false);
    };

    const on_delete_click = async () => {
        if (!delete_confirm.armed) {
            delete_confirm.arm();
            return;
        }

        delete_confirm.disarm();
        setBusy(true);

        try {
            await delete_asset(asset.id);
            show_toast(`Deleted "${asset.name}"`);
        } catch (error) {
            show_toast(`Couldn't delete "${asset.name}": ${error_message(error)}`, "error");
            setBusy(false);
        }
    };

    return (
        <div className="flex items-center gap-1">
            <button
                type="button"
                className="btn btn-ghost btn-sm btn-square"
                title="Replace image"
                disabled={busy}
                onClick={() => replace_input_ref.current?.click()}
            >
                <RefreshCw className="w-4 h-4" />
            </button>

            <button
                type="button"
                title={delete_confirm.armed ? "Click again to delete" : "Delete"}
                disabled={busy}
                onClick={on_delete_click}
                className={`btn btn-sm ml-auto ${delete_confirm.armed ? "btn-error" : "btn-ghost btn-square"}`}
            >
                <Trash className="w-4 h-4" />
                {delete_confirm.armed && "Sure?"}
            </button>

            <input ref={replace_input_ref} type="file" accept={ASSET_ACCEPT} className="hidden" onChange={on_replace_chosen} />
        </div>
    );
}

interface AssetCardProps {
    asset: Asset;
    manage: boolean;
    selected: boolean;
    onPick?: (asset_id: string) => void;
    show_toast: ShowToast;
}

const AssetCard = ({asset, manage, selected, onPick, show_toast}: AssetCardProps) => {
    const [busy, setBusy] = useState(false);

    const preview = (
        <div className={`relative aspect-square flex items-center justify-center p-4 ${CHECKERBOARD}`}>
            <img src={asset.preview_url} alt={asset.name} draggable={false} className="max-w-full max-h-full object-contain" />

            <span className="badge badge-sm badge-neutral absolute top-2 right-2 uppercase">{asset.extension}</span>

            {busy && (
                <div className="absolute inset-0 flex items-center justify-center bg-base-100/70">
                    <span className="loading loading-spinner" />
                </div>
            )}
        </div>
    );

    return (
        <div className={`card card-border bg-base-100 overflow-hidden ${selected ? "ring-2 ring-primary" : ""}`}>
            {onPick ? (
                <button type="button" title={`Use "${asset.name}"`} className="cursor-pointer hover:brightness-110" onClick={() => onPick(asset.id)}>
                    {preview}
                </button>
            ) : preview}

            <div className="flex flex-col gap-1 p-2">
                {manage
                    ? <EditableName asset={asset} show_toast={show_toast} />
                    : <span className="flex h-8 items-center px-2 text-sm font-medium"><span className="truncate">{asset.name}</span></span>
                }

                {manage && <ManageActions asset={asset} busy={busy} setBusy={setBusy} show_toast={show_toast} />}
            </div>
        </div>
    );
}

export interface AssetBrowserProps {
    /**
     * Shown at the start of the toolbar, e.g. the page title.
     */
    heading?: React.ReactNode;

    /**
     * Shown at the end of the toolbar, e.g. a dialog's close button.
     */
    toolbar_end?: React.ReactNode;

    /**
     * Show rename, replace and delete on each asset.
     */
    manage?: boolean;

    /**
     * Makes assets clickable to pick them. If exactly one file is added while picking, it's picked straight away.
     */
    onPick?: (asset_id: string) => void;

    /**
     * The currently picked asset, highlighted in the grid.
     */
    selected_id?: string | null;
}

/**
 * A searchable grid of assets with adding by button or drag and drop.
 * @returns the element
 */
export const AssetBrowser = ({heading, toolbar_end, manage = false, onPick, selected_id}: AssetBrowserProps) => {
    const assets = useAssets();
    const {toasts, show_toast} = useToasts();

    const add_input_ref = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const [adding_count, setAddingCount] = useState(0);

    // counts nested dragenter/dragleave pairs, as they fire for every child element crossed
    const [drag_depth, setDragDepth] = useState(0);

    const add_files = useCallback(
        async (files: File[]) => {
            if (files.length === 0) {
                return;
            }

            setAddingCount(files.length);

            const added_ids: string[] = [];
            const failures: string[] = [];

            // one at a time, so a failure only affects its own file
            for (const file of files) {
                try {
                    added_ids.push(await create_asset(file));
                } catch (error) {
                    failures.push(`${file.name}: ${error_message(error)}`);
                }
            }

            setAddingCount(0);

            for (const failure of failures) {
                show_toast(`Couldn't add ${failure}`, "error");
            }

            // a single upload while picking is almost always meant to be used, so skip the extra click
            if (onPick && files.length === 1 && added_ids.length === 1) {
                onPick(added_ids[0]);
                return;
            }

            if (added_ids.length > 0) {
                show_toast(`Added ${added_ids.length} asset${added_ids.length === 1 ? "" : "s"}`);
            }
        },
        [show_toast, onPick]
    );

    const filtered_assets = useMemo(() => {
        const query_lower = query.trim().toLowerCase();

        if (!assets || query_lower === "") {
            return assets;
        }

        return assets.filter(asset => asset.name.toLowerCase().includes(query_lower));
    }, [assets, query]);

    const is_file_drag = (event: React.DragEvent) => event.dataTransfer.types.includes("Files");

    return (
        <div
            className="relative flex min-h-full flex-col gap-4"
            onDragEnter={event => {
                if (is_file_drag(event)) {
                    event.preventDefault();
                    setDragDepth(depth => depth + 1);
                }
            }}
            onDragLeave={event => {
                if (is_file_drag(event)) {
                    setDragDepth(depth => Math.max(0, depth - 1));
                }
            }}
            onDragOver={event => {
                // required for the drop event to fire at all
                if (is_file_drag(event)) {
                    event.preventDefault();
                }
            }}
            onDrop={event => {
                if (!is_file_drag(event)) {
                    return;
                }

                event.preventDefault();
                setDragDepth(0);
                add_files(Array.from(event.dataTransfer.files));
            }}
        >
            <div className="flex flex-wrap items-center gap-3">
                <div className="mr-auto">{heading}</div>

                {assets && assets.length > 0 && (
                    <label className="input input-sm w-56">
                        <Search className="w-4 h-4 opacity-60" />
                        <input type="search" placeholder="Search assets" value={query} onChange={event => setQuery(event.target.value)} />
                    </label>
                )}

                <button type="button" className="btn btn-sm btn-primary" disabled={adding_count > 0} onClick={() => add_input_ref.current?.click()}>
                    {adding_count > 0 ? <span className="loading loading-spinner loading-xs" /> : <ImagePlus className="w-4 h-4" />}
                    {adding_count > 0 ? `Adding ${adding_count}...` : onPick ? "Upload" : "Add assets"}
                </button>

                {toolbar_end}

                <input
                    ref={add_input_ref}
                    type="file"
                    accept={ASSET_ACCEPT}
                    multiple
                    className="hidden"
                    onChange={event => {
                        const files = Array.from(event.target.files ?? []);

                        // cleared so picking the same files again still fires a change
                        event.target.value = "";
                        add_files(files);
                    }}
                />
            </div>

            {assets === null && (
                <div className="flex flex-1 items-center justify-center">
                    <span className="loading loading-spinner loading-lg opacity-60" />
                </div>
            )}

            {assets !== null && assets.length === 0 && (
                <button
                    type="button"
                    onClick={() => add_input_ref.current?.click()}
                    className="flex flex-1 flex-col items-center justify-center gap-3 rounded-box border-2 border-dashed border-base-300 p-10 text-center hover:border-primary hover:bg-base-200 transition-colors cursor-pointer"
                >
                    <Upload className="w-10 h-10 opacity-50" />
                    <span className="text-lg font-medium">No assets yet</span>
                    <span className="text-sm opacity-70">Drop images here, or click to choose files. PNG, JPG, WebP, GIF and SVG are supported.</span>
                </button>
            )}

            {filtered_assets && filtered_assets.length === 0 && assets && assets.length > 0 && (
                <p className="opacity-70">No assets match "{query}".</p>
            )}

            {filtered_assets && filtered_assets.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4">
                    {filtered_assets.map(asset => (
                        <AssetCard
                            key={asset.id}
                            asset={asset}
                            manage={manage}
                            selected={asset.id === selected_id}
                            onPick={onPick}
                            show_toast={show_toast}
                        />
                    ))}
                </div>
            )}

            {drag_depth > 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-box border-2 border-dashed border-primary bg-base-100/85">
                    <div className="flex flex-col items-center gap-2 text-primary">
                        <Upload className="w-10 h-10" />
                        <span className="text-lg font-medium">Drop to add assets</span>
                    </div>
                </div>
            )}

            {/* bottom centre, clear of the header buttons and the connection status toast in the corner */}
            <div className="toast toast-bottom toast-center z-20">
                {toasts.map(toast => (
                    <div key={toast.id} role="status" className={`alert alert-soft ${toast.kind === "error" ? "alert-error" : "alert-success"}`}>
                        <span>{toast.message}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
