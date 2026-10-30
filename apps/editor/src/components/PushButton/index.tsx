import {useCallback, useMemo} from "react";
import {Activity} from "lucide-react";

import {PushButtonDisplay, PushButtonFace} from "@pi-tray/ui/PushButtonFace";

import {useGridCell} from "../../util/pages";
import {useEditingPage} from "../../contexts/EditingPageContext";
import {useAsset} from "../../util/assets.ts";
import {unwrap_plugin_reference, usePluginInfo} from "../../util/plugins.ts";
import {merge_live_cell, useLiveCell} from "../../util/live_overlay.ts";

interface PushButtonProps {
    x: number;
    y: number;
    on_click?: (x: number, y: number) => void;
    highlighted?: boolean;
    className?: string;
}

/**
 * A grid button showing its stored cell, with any live values the server has sent laid over it.
 * @returns the element
 */
export const PushButton = ({x, y, on_click, highlighted, className}: PushButtonProps) => {
    // page files are row first, so y comes before x
    const [stored_cell] = useGridCell(useEditingPage(), y, x);

    // live plugins' values from the server, only for the fields the plugin says it controls
    const plugin_name = stored_cell?.action?.kind === "plugin" ? unwrap_plugin_reference(stored_cell.action.plugin).name : null;
    const plugin_info = usePluginInfo(plugin_name);
    const live_cell = useLiveCell(y, x, plugin_name);
    const is_live = (plugin_info?.live_controls?.length ?? 0) > 0;
    const cell = stored_cell && merge_live_cell(stored_cell, live_cell, plugin_info?.live_controls);

    const background_asset = useAsset(cell?.background);

    const display = useMemo<PushButtonDisplay | null>(
        () => cell ? {text: cell.text || "", text_is_icon: cell.text_is_icon || false, background_url: background_asset?.preview_url ?? null, dim_bg: cell.dim_bg} : null,
        [cell?.text, cell?.text_is_icon, background_asset?.preview_url, cell?.dim_bg]
    );
    console.log(display)

    const handle_click = useCallback(() => on_click?.(x, y), [on_click, x, y]);

    return (
        <PushButtonFace
            display={display}
            highlighted={highlighted}
            on_click={handle_click}
            className={className}
            badge={is_live ? <Activity className="w-3 h-3" /> : undefined}
            badge_title={live_cell ? "Showing live values from the server" : "Live tile. Showing the stored label until the server sends live values"}
        />
    );
}
