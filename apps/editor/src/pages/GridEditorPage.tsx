import {useCallback, useEffect, useRef, useState} from "react";

import {delete_grid_cell, useGridCell, useGridShape} from "../util/grid";
import {unwrap_plugin_reference, usePluginInfo} from "../util/plugins";
import {PushButtonGrid} from "../components/PushButtonGrid";

import {Activity, ImageIcon, MousePointerClick, Plus, Settings, Trash, X} from "lucide-react";
import {useWebSocket} from "../contexts/WSProvider.tsx";
import {ConfigEditDialog} from "../components/ConfigEditDialog.tsx";
import {IconPickerDialog} from "../components/IconPicker.tsx";
import {CustomDynamicIcon} from "../components/CustomDynamicIcon.tsx";
import {AssetPickerDialog} from "../components/AssetPickerDialog.tsx";
import {PluginPickerDialog} from "../components/PluginPickerDialog.tsx";
import {useLiveOverlayConnection} from "../util/live_overlay.ts";

interface SidebarContentProps {
    coords: {x: number, y: number};
}

const SidebarSection = ({title, title_end, children}: {title: string, title_end?: React.ReactNode, children: React.ReactNode}) => (
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
                    <button type="button" className="btn btn-ghost btn-sm btn-square" title="Remove plugin" onClick={() => onChange(null)}>
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {value && plugin_info === null && (
                <p className="text-xs text-warning">This plugin isn't installed.</p>
            )}

            <PluginPickerDialog open={picker_open} onClose={close_picker} current={value} onPick={onChange} />
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
        <button type="button" className={`btn ${variant_classes} w-full flex items-center gap-1.5 ${className}`} onClick={onClick}>
            {Icon && <Icon className={variant === "soft" ? "w-4 h-4" : "w-4.5 h-4.5"} />}
            {children}
        </button>
    );
}

const ConfirmCountdownBar = ({duration_ms}: {duration_ms: number}) => {
    const bar_ref = useRef<HTMLSpanElement>(null);

    // shrink from full width to nothing over the confirm window, starting fresh on every mount
    useEffect(() => {
        const animation = bar_ref.current?.animate(
            [{transform: "scaleX(1)"}, {transform: "scaleX(0)"}],
            {duration: duration_ms, easing: "linear", fill: "forwards"}
        );

        return () => animation?.cancel();
    }, [duration_ms]);

    return <span ref={bar_ref} className="absolute bottom-0 left-0 h-1 w-full origin-left bg-current opacity-60" />;
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
        <SidebarButton onClick={handle_click} Icon={hide_icon_on_confirming && confirming ? undefined : Icon} className={`relative overflow-hidden ${className} ${confirming ? "btn-active" : ""}`}>
            {confirming ? confirm_text : children}
            {confirming && <ConfirmCountdownBar duration_ms={reset_after_ms} />}
        </SidebarButton>
    );
}

const ChooseIconButton = ({label, setLabel}: {label: string, setLabel: (new_label: string) => void}) => {
    const [icon_picker_open, setIconPickerOpen] = useState(false);
    const close_icon_picker = useCallback(() => setIconPickerOpen(false), []);

    return (
        <>
            <div className="flex h-10 items-center gap-2">
                {label && <CustomDynamicIcon name={label} className="w-6 h-6 shrink-0" fallback_autoscale={false} />}

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

const ControlledHint = ({prop}: {prop: string}) => (
    <span className="text-xs opacity-60 flex gap-2 items-center"><Activity className="w-4 h-4" /> {prop} controlled by plugin</span>
);

const SidebarContent = ({coords}: SidebarContentProps) => {
    const [cell, setCellData] = useGridCell(coords.y, coords.x);

    const plugin = cell && (cell.plugin ? unwrap_plugin_reference(cell.plugin) : null);
    const [config_edit_open, setConfigEditOpen] = useState(false);

    const [background_picker_open, setBackgroundPickerOpen] = useState(false);
    const close_background_picker = useCallback(() => setBackgroundPickerOpen(false), []);

    const [cell_text_input, setCellTextInput] = useState(cell ? cell.text || "" : "");
    useEffect(() => {
        if (cell) {
            setCellTextInput(cell.text || "");
        }
    }, [cell]);

    const ws = useWebSocket();
    const simulate_button_push = useCallback(
        () => {
            if (!cell) {
                return;
            }

            if (!plugin) {
                alert("No plugin configured for this button.");
                return;
            }

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    action: "push",
                    payload: {
                        x: coords.x,
                        y: coords.y
                    }
                }));
            } else {
                alert("WebSocket is not open.");
            }
        },
        [cell, plugin, ws, coords]
    );

    const delete_button = useCallback(
        () => {
            if (!cell) {
                return;
            }

            delete_grid_cell(coords.y, coords.x);
        },
        [cell, coords]
    );

    // only offer configuration for plugins that declare settings
    const plugin_info = usePluginInfo(plugin ? plugin.name : null);
    const configurable = !!plugin_info?.config_template && Object.keys(plugin_info.config_template).length > 0;

    // still allow editing if the cell already has config, e.g. from before a plugin dropped its template, so it can be cleared
    const has_existing_config = !!plugin && Object.keys(plugin.config).length > 0;

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
                        }} />
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
                    <ControlledHint prop="Label" />
                </SidebarSection>
            )}

            <SidebarSection title="Plugin">
                <PluginSelect value={plugin ? plugin.name : null} onChange={new_plugin_name => {
                    if (new_plugin_name === null) {
                        // remove plugin
                        setCellData({
                            ...cell,
                            plugin: undefined
                        });
                    } else {
                        // set new plugin, with no config
                        setCellData({
                            ...cell,
                            plugin: {
                                name: new_plugin_name,
                                config: undefined
                            }
                        });
                    }
                }} />

                {plugin && (configurable || has_existing_config) && (
                    <>
                        <SidebarButton onClick={() => setConfigEditOpen(true)} Icon={Settings} variant="soft" className="btn-info">
                            Configure plugin
                        </SidebarButton>

                        <ConfigEditDialog coords={coords} open={config_edit_open} onClose={() => setConfigEditOpen(false)} />
                    </>
                )}
            </SidebarSection>

            <SidebarSection title="Background">
                {!live_controls.has("background") ? (
                    <>
                        <div className="flex gap-2">
                            <SidebarButton onClick={() => setBackgroundPickerOpen(true)} Icon={ImageIcon} variant="soft" className="flex-1">
                                {cell.background ? "Change background" : "Set background"}
                            </SidebarButton>

                            {cell.background && (
                                <button type="button" className="btn btn-ghost btn-sm btn-square" title="Remove background" onClick={() => setCellData({...cell, background: undefined})}>
                                    <X className="w-4 h-4" />
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
                ) : <ControlledHint prop="Background" />}
            </SidebarSection>

            <div className="mt-auto mb-12 flex flex-col gap-2">
                {plugin_info?.pushable !== false && (
                    <SidebarButton onClick={simulate_button_push} Icon={MousePointerClick} className="btn-primary">
                        Simulate button push
                    </SidebarButton>
                )}

                <ConfirmSidebarButton onConfirm={delete_button} Icon={Trash} className="btn-error">
                    Delete cell
                </ConfirmSidebarButton>
            </div>
        </div>
    );
}

export const GridEditorPage = () => {
    // live tile previews from the server
    useLiveOverlayConnection();

    const [shape, setGridShape] = useGridShape();

    // when a button is selected, the sidebar will be open
    const [selected_button, setSelectedButton] = useState<{x: number, y: number} | null>(null);

    const button_clicked = useCallback(
        (x: number, y: number) => {
            setSelectedButton({x, y});
        },
        []
    );

    const close_sidebar = useCallback(
        () => {
            setSelectedButton(null);
        },
        []
    );


    return (
        <div className="flex h-full max-h-full w-full max-w-full flex-1">
            <div className={`flex-1 flex flex-col h-full max-h-full max-w-full gap-4 ${selected_button ? "w-25 mr-79" : "w-full mr-0"}`}>
                <h1 className="text-2xl font-bold">Edit grid</h1>

                <div className="flex-1">
                    <PushButtonGrid rows={shape.rows} cols={shape.cols} on_click={button_clicked} highlight={selected_button} />
                </div>

                <label className="flex items-center gap-2 mt-2">
                    Grid size:

                    <input
                        type="number"
                        className="input input-sm input-bordered w-15"
                        value={shape.cols}
                        onChange={e => setGridShape({rows: shape.rows, cols: Math.max(1, Math.min(20, Number(e.target.value)))})}
                        min={1}
                        max={20}
                    />
                    x
                    <input
                        type="number"
                        className="input input-sm input-bordered w-15"
                        value={shape.rows}
                        onChange={e => setGridShape({rows: Math.max(1, Math.min(20, Number(e.target.value))), cols: shape.cols})}
                        min={1}
                        max={20}
                    />

                    ({shape.cols * shape.rows} buttons)
                </label>
            </div>

            <aside className={`h-full flex flex-col fixed top-0 right-0 w-75 overflow-y-auto bg-base-200 border-l border-l-base-300 p-4 transition-transform ${!selected_button && "translate-x-full"}`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Configure cell</h3>

                    <button title="Close configure cell sidebar" onClick={close_sidebar} className="cursor-pointer">
                        <X />
                    </button>
                </div>

                {selected_button && <SidebarContent coords={selected_button} />}
            </aside>
        </div>
    );
}

// TODO: clean into separate components, even if within the same file
// TODO: bg dimming option
// TODO: text color option
// TODO: text font selection
