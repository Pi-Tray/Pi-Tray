import {useCallback, useEffect, useRef, useState} from "react";
import {usePluginInfo} from "../util/plugins.ts";
import {Activity, House, ImageIcon, MousePointerClick, Plus, Settings, Trash, X} from "lucide-react";
import {PluginPickerDialog} from "./PluginPickerDialog.tsx";
import {CustomDynamicIcon} from "@pi-tray/ui/CustomDynamicIcon";
import {IconPickerDialog} from "./IconPicker.tsx";
import {useEditingPage, useShowEditingPage} from "../contexts/EditingPageContext.tsx";
import {delete_grid_cell, useGridCell, usePageManifest} from "../util/pages.ts";
import {CellData, unwrap_plugin_reference} from "@pi-tray/types";
import {useChannel} from "../contexts/WSProvider.tsx";
import {show_alert, show_confirm} from "../util/dialogs.ts";
import {ConfigEditDialog} from "./ConfigEditDialog.tsx";
import {AssetPickerDialog} from "./AssetPickerDialog.tsx";
import {PageSelect} from "./PageSelect.tsx";

interface SidebarContentProps {
    coords: { x: number, y: number };
}

type ActionKind = NonNullable<CellData["action"]>["kind"] | "none";

const SidebarSection = ({title, title_end, children}: {
    title: string,
    title_end?: React.ReactNode,
    children: React.ReactNode
}) => (
    <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide opacity-60">{title}</h4>
            {title_end}
        </div>

        {children}
    </section>
);
const PluginSelect = ({
                          value,
                          onChange
                      }: {
    value: string | null;
    onChange: (new_value: string | null) => void;
}) => {
    const [picker_open, setPickerOpen] = useState(false);
    const close_picker = useCallback(() => setPickerOpen(false), []);

    // undefined while loading, null if the plugin isn't installed any more
    const plugin_info = usePluginInfo(value);

    return (
        <>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className="flex h-12 min-w-0 flex-1 cursor-pointer flex-col items-start justify-center rounded-field border border-base-content/20 bg-base-100 px-3 text-left hover:border-base-content/40"
                >
                    {value ? (
                        <>
                            <span className="w-full truncate text-sm font-medium">
                                {plugin_info === undefined ? "Loading..." : plugin_info?.display_name || value.slice(value.lastIndexOf("/") + 1)}
                            </span>
                            <span className="w-full truncate font-mono text-xs opacity-60" title={value}>{value}</span>
                        </>
                    ) : (
                        <span className="text-sm opacity-60">Choose a plugin...</span>
                    )}
                </button>

                {value && (
                    <button type="button" className="btn btn-ghost btn-sm btn-square" title="Remove plugin"
                            onClick={() => onChange(null)}>
                        <X className="w-4 h-4"/>
                    </button>
                )}
            </div>

            {value && plugin_info === null && (
                <p className="text-xs text-warning">This plugin isn't installed.</p>
            )}

            <PluginPickerDialog open={picker_open} onClose={close_picker} current={value} onPick={onChange}/>
        </>
    );
}

interface SidebarButtonProps {
    children: React.ReactNode;
    onClick: () => void;
    Icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    className?: string;
    variant?: "outline" | "soft";
}

const SidebarButton = ({children, onClick, Icon, className = "", variant = "outline"}: SidebarButtonProps) => {
    const variant_classes = variant === "soft" ? "btn-soft btn-sm" : "btn-outline";

    return (
        <button type="button" className={`btn ${variant_classes} w-full flex items-center gap-1.5 ${className}`}
                onClick={onClick}>
            {Icon && <Icon className={variant === "soft" ? "w-4 h-4" : "w-4.5 h-4.5"}/>}
            {children}
        </button>
    );
}
const ConfirmCountdownBar = ({duration_ms}: { duration_ms: number }) => {
    const bar_ref = useRef<HTMLSpanElement>(null);

    // shrink from full width to nothing over the confirm window, starting fresh on every mount
    useEffect(() => {
        const animation = bar_ref.current?.animate(
            [{transform: "scaleX(1)"}, {transform: "scaleX(0)"}],
            {duration: duration_ms, easing: "linear", fill: "forwards"}
        );

        return () => animation?.cancel();
    }, [duration_ms]);

    return <span ref={bar_ref} className="absolute bottom-0 left-0 h-1 w-full origin-left bg-current opacity-60"/>;
}
const ConfirmSidebarButton = ({
                                  children,
                                  onConfirm,
                                  Icon,
                                  className = "",
                                  confirm_text = "Sure? Click again to confirm.",
                                  hide_icon_on_confirming = true,
                                  reset_after_ms = 3000
                              }: {
    children: React.ReactNode,
    onConfirm: () => void,
    Icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>,
    className?: string,
    confirm_text?: string,
    hide_icon_on_confirming?: boolean,
    reset_after_ms?: number
}) => {
    const [confirming, setConfirming] = useState(false);

    // drop back to the normal label if the user doesn't confirm in time
    useEffect(() => {
        if (!confirming) {
            return;
        }

        const reset_timeout = setTimeout(() => setConfirming(false), reset_after_ms);
        return () => clearTimeout(reset_timeout);
    }, [confirming, reset_after_ms]);

    const handle_click = () => {
        if (confirming) {
            setConfirming(false);
            onConfirm();
        } else {
            setConfirming(true);
        }
    };

    return (
        <SidebarButton onClick={handle_click} Icon={hide_icon_on_confirming && confirming ? undefined : Icon}
                       className={`relative overflow-hidden ${className} ${confirming ? "btn-active" : ""}`}>
            {confirming ? confirm_text : children}
            {confirming && <ConfirmCountdownBar duration_ms={reset_after_ms}/>}
        </SidebarButton>
    );
}
const ChooseIconButton = ({label, setLabel}: { label: string, setLabel: (new_label: string) => void }) => {
    const [icon_picker_open, setIconPickerOpen] = useState(false);
    const close_icon_picker = useCallback(() => setIconPickerOpen(false), []);

    return (
        <>
            <div className="flex h-10 items-center gap-2">
                {label && <CustomDynamicIcon name={label} className="w-6 h-6 shrink-0" fallback_autoscale={false}/>}

                <SidebarButton onClick={() => setIconPickerOpen(true)} variant="soft" className="flex-1">
                    {label ? "Change icon" : "Choose icon"}
                </SidebarButton>
            </div>

            <IconPickerDialog
                open={icon_picker_open}
                onClose={close_icon_picker}
                current={label}
                onPick={new_icon_name => setLabel(new_icon_name)}
            />
        </>
    );
}
const ControlledHint = ({prop}: { prop: string }) => (
    <span className="text-xs opacity-60 flex gap-2 items-center"><Activity className="w-4 h-4"/> {prop} controlled by plugin</span>
);

const PluginSection = ({
                           plugin,
                           coords,
                           configurable,
                           has_existing_config,
                           cell,
                           setCellData
                       }: {
    plugin: ReturnType<typeof unwrap_plugin_reference> | null,
    coords: { x: number, y: number },
    configurable: boolean,
    has_existing_config: boolean,
    cell: CellData,
    setCellData: (new_cell: CellData) => void
}) => {
    const [config_edit_open, setConfigEditOpen] = useState(false);

    return (
        <SidebarSection title="Plugin">
            <PluginSelect value={plugin ? plugin.name : null} onChange={new_plugin_name => {
                if (new_plugin_name === null) {
                    // remove plugin
                    setCellData({
                        ...cell,
                        action: undefined
                    });
                } else {
                    // set new plugin, with no config
                    setCellData({
                        ...cell,
                        action: {kind: "plugin", plugin: {name: new_plugin_name, config: undefined}}
                    });
                }
            }}/>

            {plugin && (configurable || has_existing_config) && (
                <>
                    <SidebarButton onClick={() => setConfigEditOpen(true)} Icon={Settings} variant="soft" className="btn-info">
                        Configure plugin
                    </SidebarButton>

                    <ConfigEditDialog coords={coords} open={config_edit_open} onClose={() => setConfigEditOpen(false)}/>
                </>
            )}
        </SidebarSection>
    );
}

/**
 * Picks the page a link goes to.
 * @param page_id the linked page, or null while none has been chosen
 */
const PageSection = ({page_id, onChange}: { page_id: string | null, onChange: (new_page_id: string) => void }) => {
    const manifest = usePageManifest();

    const search_ref = useRef<HTMLInputElement>(null);
    const on_dropdown_open = useCallback(() => {
        requestAnimationFrame(() => search_ref.current?.focus());
    }, []);

    const on_select = useCallback((new_page_id: string) => {
        onChange(new_page_id);

        // closes the dropdown, which is open for as long as something inside it has focus
        (document.activeElement as HTMLElement | null)?.blur();
    }, [onChange]);

    return (
        <SidebarSection title="Page">
            <div className="dropdown w-full">
                {/* the select class draws the same arrow as a real select. a div, as webkit doesn't focus a clicked button */}
                <div
                    tabIndex={0}
                    role="button"
                    className="select select-bordered w-full cursor-pointer"
                    onFocus={on_dropdown_open}
                >
                    {page_id && page_id === manifest.home && <House className="w-4 shrink-0 opacity-60"/>}
                    <span className={`truncate ${page_id ? "" : "opacity-60"}`}>
                        {page_id ? manifest.names[page_id] ?? "Deleted page" : "Choose a page..."}
                    </span>
                </div>
                <ul tabIndex={-1} className="dropdown-content w-full bg-base-300">
                    <PageSelect
                        selected={page_id ?? ""}
                        on_select={on_select}
                        show_create={false}
                        search_ref={search_ref}
                    />
                </ul>
            </div>
        </SidebarSection>
    );
}

export const GridEditorSidebarContent = ({coords}: SidebarContentProps) => {
    const page_id = useEditingPage();
    const show_page = useShowEditingPage();
    const manifest = usePageManifest();
    const [cell, setCellData] = useGridCell(page_id, coords.y, coords.x);

    const plugin = cell?.action?.kind === "plugin" ? unwrap_plugin_reference(cell.action.plugin) : null;

    const [background_picker_open, setBackgroundPickerOpen] = useState(false);
    const close_background_picker = useCallback(() => setBackgroundPickerOpen(false), []);

    const [cell_text_input, setCellTextInput] = useState(cell ? cell.text || "" : "");
    useEffect(() => {
        if (cell) {
            setCellTextInput(cell.text || "");
        }
    }, [cell]);

    // the kind picked in the select. plugin and page aren't saved until one's chosen, so a half-made action never reaches the Pi.
    // reset when another cell is selected too, as the sidebar stays mounted while switching cells
    const [chosen_kind, setChosenKind] = useState<ActionKind>(cell?.action?.kind ?? "none");
    useEffect(() => {
        setChosenKind(cell?.action?.kind ?? "none");
    }, [cell?.action?.kind, page_id, coords.x, coords.y]);

    // only offer configuration for plugins that declare settings
    const plugin_info = usePluginInfo(plugin ? plugin.name : null);
    const configurable = !!plugin_info?.config_template && Object.keys(plugin_info.config_template).length > 0;

    // still allow editing if the cell already has config, e.g. from before a plugin dropped its template, so it can be cleared
    const has_existing_config = !!plugin && Object.keys(plugin.config).length > 0;

    const change_action_kind = useCallback(async (new_kind: ActionKind) => {
        if (!cell) {
            return;
        }

        // settings can take effort to set up, unlike a link, so make sure they're not lost by accident
        if (plugin && has_existing_config && new_kind !== "plugin") {
            const confirmed = await show_confirm({
                title: "Remove plugin?",
                message: `This button's ${plugin_info?.display_name ?? plugin.name} settings will be lost.`,
                confirm_label: "Remove",
                tone: "danger"
            });

            if (!confirmed) {
                return;
            }
        }

        setChosenKind(new_kind);

        switch (new_kind) {
            case "none":
                setCellData({...cell, action: undefined});
                break;
            case "home":
            case "back":
                setCellData({...cell, action: {kind: new_kind}});
                break;
            // plugin and page are saved by their pickers
        }
    }, [cell, plugin, plugin_info, has_existing_config, setCellData]);

    const channel = useChannel();
    const simulate_button_push = useCallback(
        () => {
            const action = cell?.action;

            if (!action) {
                return;
            }

            // following a link on the server would move the editor's connection to another page while the editor stays
            // on this one, so the editor follows it itself
            if (action.kind === "page") {
                if (manifest.order.includes(action.id)) {
                    show_page(action.id);
                } else {
                    show_alert("The page this button goes to has been deleted.");
                }
                return;
            }

            if (action.kind === "home") {
                show_page(manifest.home);
                return;
            }

            if (channel && channel.status === "ready") {
                channel.send({
                    action: "push",
                    payload: {
                        x: coords.x,
                        y: coords.y
                    }
                });
            } else {
                show_alert("Not connected to the server.");
            }
        },
        [cell, manifest, show_page, channel, coords]
    );

    // back follows the device's own history, which the editor doesn't have
    const can_simulate = cell?.action !== undefined && cell.action.kind !== "back"
        && (cell.action.kind !== "plugin" || plugin_info?.pushable !== false);

    const delete_button = useCallback(
        () => {
            if (!cell) {
                return;
            }

            delete_grid_cell(page_id, coords.y, coords.x);
        },
        [cell, page_id, coords]
    );

    // fields a live plugin sets itself, so editing them here would have no visible effect
    const live_controls = new Set(plugin_info?.live_controls ?? []);
    if (!cell) {
        return (
            <div className="flex flex-col gap-2">
                <p className="opacity-70">Empty cell</p>

                <SidebarButton onClick={() => setCellData({text: ""})} Icon={Plus} className="btn-primary">
                    Create
                </SidebarButton>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 flex-1">
            {!live_controls.has("label") ? (
                <SidebarSection
                    title="Label"
                    title_end={
                        <div className="flex items-center gap-3 text-xs" role="radiogroup" aria-label="Label type">
                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="radio"
                                    name="label_type"
                                    className="radio radio-xs"
                                    checked={!cell.text_is_icon}
                                    onChange={() => setCellData({...cell, text_is_icon: false})}
                                />
                                Text
                            </label>

                            <label className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                    type="radio"
                                    name="label_type"
                                    className="radio radio-xs"
                                    checked={!!cell.text_is_icon}
                                    onChange={() => setCellData({...cell, text_is_icon: true})}
                                />
                                Icon
                            </label>
                        </div>
                    }
                >
                    {cell.text_is_icon ? (
                        <ChooseIconButton label={cell_text_input} setLabel={new_label => {
                            setCellTextInput(new_label);
                            setCellData({
                                ...cell,
                                text: new_label
                            });
                        }}/>
                    ) : (
                        <input
                            className="input input-bordered h-10 w-full"
                            aria-label="Label text"
                            placeholder="Button text"
                            value={cell_text_input}
                            onChange={e => setCellTextInput(e.target.value)}
                            onBlur={() => {
                                // TODO: fix the logic with the debounced autosave, it was just too many hooks setting each other off causing blank outs and infinite loops
                                setCellData({
                                    ...cell,
                                    text: cell_text_input
                                });
                            }}
                        />
                    )}
                </SidebarSection>
            ) : (
                <SidebarSection title="Label">
                    <ControlledHint prop="Label"/>
                </SidebarSection>
            )}

            <SidebarSection title="Action">
                <select
                    className="select select-bordered w-full"
                    aria-label="Action type"
                    value={chosen_kind}
                    onChange={e => change_action_kind(e.target.value as ActionKind)}
                >
                    <option value="none">None</option>
                    <option value="plugin">🧩 Run plugin</option>
                    <option value="page">📜 Go to page</option>
                    <option value="home">🏠 Go to home page</option>
                    <option value="back">↩ Return to previous page</option>
                </select>
            </SidebarSection>

            {chosen_kind === "plugin" && (
                <PluginSection
                    plugin={plugin}
                    coords={coords}
                    configurable={configurable}
                    has_existing_config={has_existing_config}
                    cell={cell}
                    setCellData={setCellData}
                />
            )}

            {chosen_kind === "page" && (
                <PageSection
                    page_id={cell.action?.kind === "page" ? cell.action.id : null}
                    onChange={new_page_id => {
                        setCellData({
                            ...cell,
                            action: {kind: "page", id: new_page_id}
                        });
                    }}
                />
            )}

            <SidebarSection title="Background">
                {!live_controls.has("background") ? (
                    <>
                        <div className="flex gap-2">
                            <SidebarButton onClick={() => setBackgroundPickerOpen(true)} Icon={ImageIcon} variant="soft"
                                           className="flex-1">
                                {cell.background ? "Change background" : "Set background"}
                            </SidebarButton>

                            {cell.background && (
                                <button type="button" className="btn btn-ghost btn-sm btn-square"
                                        title="Remove background"
                                        onClick={() => setCellData({...cell, background: undefined})}>
                                    <X className="w-4 h-4"/>
                                </button>
                            )}
                        </div>

                        <AssetPickerDialog
                            open={background_picker_open}
                            onClose={close_background_picker}
                            selected_id={cell.background}
                            onPick={asset_id => setCellData({...cell, background: asset_id})}
                        />
                    </>
                ) : <ControlledHint prop="Background"/>}
            </SidebarSection>

            <div className="mt-auto mb-12 flex flex-col gap-2">
                {can_simulate && (
                    <SidebarButton onClick={simulate_button_push} Icon={MousePointerClick} className="btn-primary">
                        {cell.action?.kind === "page" || cell.action?.kind === "home" ? "Follow link" : "Simulate button push"}
                    </SidebarButton>
                )}

                <ConfirmSidebarButton onConfirm={delete_button} Icon={Trash} className="btn-error">
                    Delete cell
                </ConfirmSidebarButton>
            </div>
        </div>
    );
}
