import {useCallback, useState} from "react";
import type {PageTitle, ServerMessage} from "@pi-tray/types";

import {useChannelMessage, useChannelStatus} from "../../contexts/WSContext";

import styles from "./component.module.css";

/**
 * The name of the page being shown, in the corner opposite the connection status.
 * @returns the element, or nothing until a page has arrived or while disconnected
 */
export const PageName = ({className}: {className?: string}) => {
    const [name, setName] = useState<string | null>(null);
    const [title, setTitle] = useState<PageTitle>("right");
    const status = useChannelStatus();

    const handle_message = useCallback((message: ServerMessage) => {
        if (message.action === "set_page") {
            setName(message.payload.name);
            // older servers don't send it
            setTitle(message.payload.title ?? "right");
        }
    }, []);
    useChannelMessage(handle_message);

    // while disconnected, the connection status says more than the name of a page that may have changed
    if (!name || status !== "ready" || title === "none") {
        return null;
    }

    return <div className={`${styles.element} ${styles[title]} ${className ?? ""}`}>{name}</div>;
}
