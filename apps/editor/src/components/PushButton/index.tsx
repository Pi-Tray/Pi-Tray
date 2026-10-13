import {useCallback} from "react";
import {useGridCell} from "../../util/grid";

import {AutoTextScale} from "../AutoTextScale";

import styles from "./component.module.css";
import {CustomDynamicIcon} from "../CustomDynamicIcon.tsx";
import {useAsset} from "../../util/assets.ts";
import {Activity} from "lucide-react";
import {unwrap_plugin_reference, usePluginInfo} from "../../util/plugins.ts";
import {merge_live_cell, useLiveCell} from "../../util/live_overlay.ts";

// adapted from client PushButton code, but ws behaviour ripped out and adapted to a callback function
// also uses the hook useGridCell to handle the button's representation rather than asking the server for it
// TODO: would be good to have some unified component package rather than duplicating this code by hand and changing it

interface PushButtonProps {
    x: number;
    y: number;
    on_click?: (x: number, y: number) => void;
    style?: React.CSSProperties;
    className?: string;
}

/**
 * The button component that represents a single push button on the grid.
 * @param x x coordinate of the button on the grid, used to identify the button in the callback
 * @param y y coordinate of the button on the grid, used to identify the button in the callback
 * @param style inline styles to apply to the button
 * @param className additional class names to apply
 * @param on_click callback function to call when the button is clicked, receives x and y coordinates
 * @returns the element
 */
export const PushButton = ({x, y, style, className, on_click}: PushButtonProps) => {
    // this made me realise that all the files are row first, but we use x and y for indices. doesnt really matter just initially confusing
    const [stored_cell] = useGridCell(y, x);

    // live plugins' values from the server, only for the fields the plugin says it controls
    const plugin_name = stored_cell?.plugin ? unwrap_plugin_reference(stored_cell.plugin).name : null;
    const plugin_info = usePluginInfo(plugin_name);
    const live_cell = useLiveCell(y, x, plugin_name);
    const is_live = (plugin_info?.live_controls?.length ?? 0) > 0;
    const cell = stored_cell && merge_live_cell(stored_cell, live_cell, plugin_info?.live_controls);

    const background_asset = useAsset(cell?.background);

    // log function that includes button coordinates, acts just like console.log
    const button_log = useCallback(
        (...msg: any[]) => {
            console.log(`[PushButton ${x},${y}]:`, ...msg);
        },
        [x, y]
    );

    // no prizes for guessing what this does
    const button_error = useCallback(
        (...msg: any[]) => {
            console.error(`[PushButton ${x},${y}]:`, ...msg);
        },
        [x, y]
    );

    // run callback when the button is clicked
    const handle_click = useCallback(
        () => {
            try {
                button_log("Button clicked.");
                if (on_click) {
                    on_click(x, y);
                } else {
                    button_log("No on_click callback provided, not sending push action.");
                }
            } catch (e) {
                button_error("Error in on_click callback:", e);
            }
        },
        [on_click, x, y]
    );

    if (cell) {
        button_log(cell);
    } else {
        button_error("No cell data found for button at", x, y);
    }

    let content: React.ReactNode = null;

    const text = cell?.text || "";
    const text_is_icon = cell?.text_is_icon || false;

    if (text) {
        if (text_is_icon) {
            content = <CustomDynamicIcon name={text} className={styles.icon} />;
        } else {
            content = <AutoTextScale>{text}</AutoTextScale>;
        }
    }

    // JSON.stringify quotes and escapes the url, so it can't break out of the css url()
    const button_style: React.CSSProperties = background_asset
        ? {...style, backgroundImage: `url(${JSON.stringify(background_asset.preview_url)})`, backgroundSize: "cover", backgroundPosition: "center"}
        : {...style};

    return (
        <button style={button_style} className={`${styles.element} ${className || ""}`} onClick={handle_click}>
            {content}
            {is_live && (
                <span className={styles.live_badge} title={live_cell ? "Showing live values from the server" : "Live tile. Showing the stored label until the server sends live values"}>
                    <Activity className={styles.live_badge_icon} />
                </span>
            )}
        </button>
    );
}
