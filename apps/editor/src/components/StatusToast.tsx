import {useState} from "react";
import {useWebSocket, useWebSocketReadyStateChange} from "../contexts/WSProvider";

import {motion} from "motion/react";

export const StatusToast = () => {
    // shows the latest "stable" status
    // i.e. it only shows connecting the first time it's trying to connect, and then shows open/closed until the next update
    // this is because exponential backoff is used for reconnecting, which will make the ws alternate between connecting and closed states,
    // which is not very useful to show in the ui

    const ws = useWebSocket();
    const [displayed_status, setDisplayedStatus] = useState<WebSocket["readyState"]>(WebSocket.CONNECTING);

    useWebSocketReadyStateChange((new_status: WebSocket["readyState"]) => {
        if (new_status === WebSocket.OPEN || new_status === WebSocket.CLOSED) {
            setDisplayedStatus(new_status);
        }
    });

    let text;
    let status_class;
    let show_pinger;

    if (ws === null) {
        // null ws indicates no url was provided or the provider isn't in the dom
        // so the user hasn't configured the server address yet

        text = "Configure server address!";
        status_class = "status-neutral";
        show_pinger = false;
    } else {
        switch (displayed_status) {
            case WebSocket.OPEN:
                text = "Running";
                status_class = "status-success";
                show_pinger = false;
                break;
            case WebSocket.CLOSED:
            case WebSocket.CLOSING:
                text = "Stopped";
                status_class = "status-error";
                show_pinger = true;
                break;
            case WebSocket.CONNECTING:
            default:
                text = "Connecting...";
                status_class = "status-neutral";
                show_pinger = true;
                break;
        }
    }

    return (
        <motion.div layout className="toast toast-bottom toast-end">
            <div
                className="inline-flex items-center gap-2 rounded-full bg-base-300 px-3 py-1.5 text-sm text-base-content">
                <span>{text}</span>

                <div className="inline-grid *:[grid-area:1/1]">
                    {show_pinger && <span className={`status animate-ping ${status_class}`}></span>}
                    <span className={`status ${status_class}`}></span>
                </div>
            </div>
        </motion.div>
    );
}
