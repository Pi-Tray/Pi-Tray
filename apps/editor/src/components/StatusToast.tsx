import {useEffect, useState} from "react";
import {ChannelStatus, useChannel, useChannelStatus} from "../contexts/WSProvider";

import {motion} from "motion/react";

export const StatusToast = () => {
    // shows the latest "stable" status
    // i.e. it only shows connecting the first time it's trying to connect, and then shows ready/closed until the next update
    // this is because exponential backoff is used for reconnecting, which will make the channel alternate between connecting and closed states,
    // which is not very useful to show in the ui

    const channel = useChannel();
    const status = useChannelStatus();

    const [displayed_status, setDisplayedStatus] = useState<ChannelStatus>("connecting");
    useEffect(() => {
        if (status === "ready" || status === "closed") {
            setDisplayedStatus(status);
        }
    }, [status]);

    let text;
    let status_class;
    let show_pinger;

    if (channel === null) {
        // null channel indicates no url was provided or the provider isn't in the dom
        // so the user hasn't configured the server address yet

        text = "Configure server address!";
        status_class = "status-neutral";
        show_pinger = false;
    } else {
        switch (displayed_status) {
            case "ready":
                text = "Running";
                status_class = "status-success";
                show_pinger = false;
                break;
            case "closed":
                text = "Stopped";
                status_class = "status-error";
                show_pinger = true;
                break;
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
