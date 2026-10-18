import {useEffect, useState} from "react";
import {ChannelStatus, useChannel, useChannelStatus} from "../contexts/WSProvider";
import {SupervisorConnection, SupervisorStatus, useSupervisor} from "../contexts/SupervisorProvider";
import {useConfigValue} from "../util/config";

import {motion} from "motion/react";
import {Link} from "wouter";

// how long a server that's just started gets to accept the editor's connection before it's shown as a problem
const STARTING_GRACE_MS = 10_000;

interface DisplayedStatus {
    text: string;
    status_class: string;
    show_pinger: boolean;
}

const describe_channel = (channel_configured: boolean, channel_status: ChannelStatus): DisplayedStatus => {
    if (!channel_configured) {
        return {text: "Configure server address!", status_class: "status-neutral", show_pinger: false};
    }

    switch (channel_status) {
        case "ready":
            return {text: "Connected", status_class: "status-success", show_pinger: false};
        case "closed":
            return {text: "Can't connect", status_class: "status-error", show_pinger: true};
        default:
            return {text: "Connecting...", status_class: "status-neutral", show_pinger: true};
    }
}

const describe_server = (
    connection: SupervisorConnection,
    server: SupervisorStatus | null,
    channel_configured: boolean,
    channel_status: ChannelStatus,
    starting: boolean
): DisplayedStatus => {
    if (connection === "connecting") {
        return {text: "Checking...", status_class: "status-neutral", show_pinger: true};
    }

    if (connection === "not_running" || !server) {
        return {text: "Pi-Tray isn't running", status_class: "status-error", show_pinger: false};
    }

    switch (server.state) {
        case "stopped":
            return {text: "Server stopped", status_class: "status-neutral", show_pinger: false};
        case "waiting_to_restart":
            return {text: "Server crashed, restarting...", status_class: "status-warning", show_pinger: true};
        case "failed":
            return {text: "Server keeps crashing", status_class: "status-error", show_pinger: false};
    }

    // running, so whether it's usable comes down to the editor's connection to it
    if (!channel_configured) {
        return {text: "Configure server address!", status_class: "status-neutral", show_pinger: false};
    }

    if (channel_status === "ready") {
        return {text: "Running", status_class: "status-success", show_pinger: false};
    }

    if (starting) {
        return {text: "Starting...", status_class: "status-neutral", show_pinger: true};
    }

    return {text: "Running, but can't connect", status_class: "status-warning", show_pinger: true};
}

export const StatusToast = () => {
    const channel = useChannel();
    const status = useChannelStatus();
    const {connection, status: server} = useSupervisor();

    // a custom address may be another PC's server, which this PC's supervisor knows nothing about
    const [custom_address] = useConfigValue("dont_overwrite_ws_url");

    // shows the latest "stable" status
    // i.e. it only shows connecting the first time it's trying to connect, and then shows ready/closed until the next update
    // this is because exponential backoff is used for reconnecting, which will make the channel alternate between connecting and closed states,
    // which is not very useful to show in the ui
    const [displayed_channel_status, setDisplayedChannelStatus] = useState<ChannelStatus>("connecting");
    useEffect(() => {
        if (status === "ready" || status === "closed") {
            setDisplayedChannelStatus(status);
        }
    }, [status]);

    // whether the server started recently enough that not being connected yet is expected, re-checked once that time is up
    const started_at = server?.state === "running" && server.started_at ? Date.parse(server.started_at) : null;
    const [starting, setStarting] = useState(false);
    useEffect(() => {
        if (started_at === null) {
            setStarting(false);
            return;
        }

        const remaining_ms = started_at + STARTING_GRACE_MS - Date.now();
        setStarting(remaining_ms > 0);

        if (remaining_ms <= 0) {
            return;
        }

        const grace_timeout = setTimeout(() => setStarting(false), remaining_ms);
        return () => clearTimeout(grace_timeout);
    }, [started_at]);

    // null channel indicates no url was provided or the provider isn't in the dom
    // so the user hasn't configured the server address yet
    const channel_configured = channel !== null;

    const {text, status_class, show_pinger} = custom_address
        ? describe_channel(channel_configured, displayed_channel_status)
        : describe_server(connection, server, channel_configured, displayed_channel_status, starting);

    return (
        <motion.div layout className="toast toast-bottom toast-end">
            <div
                className="inline-flex items-center gap-2 rounded-full bg-base-300 px-3 py-1.5 text-sm text-base-content">
                <Link href="/server" className="hover:underline" title="Click to configure server">{text}</Link>

                <div className="inline-grid *:[grid-area:1/1]">
                    {show_pinger && <span className={`status animate-ping ${status_class}`}></span>}
                    <span className={`status ${status_class}`}></span>
                </div>
            </div>
        </motion.div>
    );
}