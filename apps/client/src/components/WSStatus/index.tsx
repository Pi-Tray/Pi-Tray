import {ChannelStatus, useChannelStatus} from "../../contexts/WSContext";

import {CircleAlert, Lock, Unplug} from "lucide-react";

import styles from "./component.module.css";

interface StatusMapEntry {
    message: string;
    icon?: React.ReactNode;
    className: string;
}

const status_map: Record<ChannelStatus, StatusMapEntry> = {
    connecting: {
        message: "Connecting...",
        icon: <Unplug className={styles.icon} />,
        className: styles.connecting
    },
    encrypting: {
        message: "Encrypting...",
        icon: <Lock className={styles.icon} />,
        className: styles.connecting
    },
    ready: {
        message: "Connected.",
        className: "hidden"
    },
    closed: {
        message: "Waiting to reconnect...",
        icon: <CircleAlert className={styles.icon} />,
        className: styles.closed
    },
};

interface WSStatusProps {
    className?: string;
}

/**
 * Component that displays the current channel connection status.
 * @param className additional class names to apply
 * @constructor
 */
export const WSStatus = ({className}: WSStatusProps) => {
    const status = status_map[useChannelStatus()];

    return (
        <div className={`${styles.element} ${status.className} ${className || ""}`}>
            {status.icon || null}
            {status.message}
        </div>
    );
}
