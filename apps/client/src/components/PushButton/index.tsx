import {memo, useCallback, useEffect, useMemo, useRef, useState} from "react";

import {ButtonDisplay, PushButtonFace, ButtonResult} from "@pi-tray/ui/PushButtonFace";
import {CellPayload} from "@pi-tray/types";

import {useChannel} from "../../contexts/WSContext.tsx";
import {load_asset, StaleAssetSessionError} from "../../util/assets.ts";

/**
 * Loads an asset path from the server into an object url, revoking it once it's been replaced on screen.
 * @param asset_path e.g. /assets/<id>.png?v=123, or null for none
 * @returns the url to show, or an empty string while there's nothing to show
 */
const useAssetUrl = (asset_path: string | null) => {
    const channel = useChannel();
    const socket_url = channel?.url ?? "";
    const assets = channel?.assets ?? null;

    const [object_url, setObjectURL] = useState("");

    // what object_url is showing, so a reconnect doesn't load the same image again
    const shown_path = useRef<string | null>(null);

    useEffect(() => {
        if (!asset_path) {
            shown_path.current = null;
            setObjectURL("");
            return;
        }

        // the current image stays up while reconnecting
        if (asset_path === shown_path.current || !assets) {
            return;
        }

        let superseded = false;

        load_asset(asset_path, socket_url, assets)
            .then((image) => {
                if (superseded) {
                    return;
                }

                // null is a missing or replaced asset, and a replaced one's new path follows in a set_cells
                shown_path.current = image ? asset_path : null;
                setObjectURL(image ? URL.createObjectURL(image) : "");
            })
            .catch((error) => {
                // the session ended while loading, the next one loads it again
                if (!(error instanceof StaleAssetSessionError)) {
                    console.error(`Couldn't load ${asset_path}:`, error);
                }
            });

        return () => {
            superseded = true;
        };
        // the session's id rather than the object, which is new on every render of the channel
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [asset_path, socket_url, assets?.id]);

    useEffect(() => () => {
        if (object_url) {
            URL.revokeObjectURL(object_url);
        }
    }, [object_url]);

    return object_url;
}

interface PushButtonProps {
    x: number;
    y: number;

    /** The cell as the server last sent it, or undefined if it hasn't yet */
    cell: CellPayload | undefined;

    result: ButtonResult;
    on_push: (x: number, y: number) => void;

    className?: string;
}

/**
 * A button showing a cell from the server, which asks the server to push it when pressed.
 * @returns the element
 */
export const PushButton = memo(({x, y, cell, result, on_push, className}: PushButtonProps) => {
    const background_url = useAssetUrl(cell?.background ?? null);

    const display = useMemo<ButtonDisplay | null>(
        () => cell ? {text: cell.text, text_is_icon: cell.is_icon, background_url: background_url || null, pushable: cell.pushable} : null,
        [cell, background_url]
    );

    const handle_click = useCallback(() => on_push(x, y), [on_push, x, y]);

    return <PushButtonFace display={display} result={result} on_click={handle_click} className={className} />;
});
