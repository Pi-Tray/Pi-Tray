import {useCallback, useEffect, useRef, useState} from "react";
import {useMediaQuery} from "../hooks/useMediaQuery.ts";
import {useGridCell} from "../util/grid.ts";
import {unwrap_plugin_reference, usePluginInfo} from "../util/plugins.ts";
import {find_missing_required, PluginConfigForm} from "./PluginConfigForm.tsx";
import {X} from "lucide-react";
import {githubDarkTheme, githubLightTheme, JsonEditor} from "json-edit-react";

export const ConfigEditDialog = ({
    coords,
    open,
    onClose
}: {
    coords: {x: number, y: number};
    open: boolean;
    onClose: () => void;
}) => {
    const dialog_ref = useRef<HTMLDialogElement>(null);
    const dark_mode = useMediaQuery("(prefers-color-scheme: dark)");

    const [cell, setCellData] = useGridCell(coords.y, coords.x);

    const plugin = cell && (cell.plugin ? unwrap_plugin_reference(cell.plugin) : null);
    const plugin_info = usePluginInfo(plugin ? plugin.name : null);

    // edits are drafted here and only written to grid.json on save, so typing doesn't rewrite the file on every keystroke
    const [draft_config, setDraftConfig] = useState<{ [key: string]: any }>({});
    const [show_raw_json, setShowRawJson] = useState(false);

    // start from the saved config every time the dialog opens, discarding any unsaved edits from last time
    useEffect(() => {
        if (open && plugin) {
            setDraftConfig(plugin.config);
            setShowRawJson(false);
        }
    }, [open]);

    // sync open state
    useEffect(() => {
        if (dialog_ref.current) {
            if (open) {
                dialog_ref.current.showModal();
            } else {
                dialog_ref.current.close();
            }

            const on_close = () => {
                onClose();
            }

            dialog_ref.current.addEventListener("close", on_close);

            return () => {
                dialog_ref.current?.removeEventListener("close", on_close);
            }
        }
    }, [open, onClose]);

    const save = useCallback(
        () => {
            if (!cell || !cell.plugin) {
                return;
            }

            const new_plugin = unwrap_plugin_reference(cell.plugin);
            new_plugin.config = draft_config;

            setCellData({
                ...cell,
                plugin: new_plugin
            });

            onClose();
        },
        [cell, setCellData, draft_config, onClose]
    );

    if (!cell || !plugin) {
        return null;
    }

    const template = plugin_info?.config_template;
    const missing_fields = template ? find_missing_required(template, draft_config) : [];

    // plugins without a template can only be configured as raw json
    const raw_json_only = plugin_info !== undefined && !template;

    return (
        <dialog ref={dialog_ref} className="modal">
            <div className="modal-box w-2xl max-w-2xl flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">{plugin_info?.display_name || plugin.name}</h3>

                    <form method="dialog">
                        <button className="cursor-pointer" title="Close dialog">
                            <X />
                        </button>
                    </form>
                </div>

                {plugin_info === undefined && <p className="opacity-70">Loading plugin info...</p>}

                {template && !show_raw_json && (
                    <PluginConfigForm template={template} value={draft_config} onChange={setDraftConfig} />
                )}

                {(show_raw_json || raw_json_only) && (
                    // @ts-ignore
                    <JsonEditor theme={dark_mode ? githubDarkTheme : githubLightTheme} data={draft_config} setData={setDraftConfig} />
                )}

                {missing_fields.length > 0 && (
                    <p className="text-sm text-error">Required: {missing_fields.join(", ")}</p>
                )}

                <div className="modal-action mt-0 items-center">
                    {template && (
                        <label className="flex items-center gap-2 mr-auto text-sm">
                            <input type="checkbox" className="toggle toggle-sm" checked={show_raw_json} onChange={event => setShowRawJson(event.target.checked)} />
                            Raw JSON
                        </label>
                    )}

                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={missing_fields.length > 0} onClick={save}>Save</button>
                </div>
            </div>
        </dialog>
    );
}
