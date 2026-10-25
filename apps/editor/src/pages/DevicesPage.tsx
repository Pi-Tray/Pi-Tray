import {useChannel} from "../contexts/WSProvider.tsx";
import {useCallback, useEffect, useMemo, useState} from "react";
import {PairedDeviceInfo} from "@pi-tray/types";
import {Clock, KeyRound, MonitorSmartphone, Plus, RefreshCw, RotateCcw, Trash2, TriangleAlert} from "lucide-react";
import {Link} from "wouter";
import {CustomDynamicIcon} from "@pi-tray/ui/CustomDynamicIcon";
import {show_confirm} from "../util/dialogs.ts";
import {editor_version} from "../version.ts";

const format_date = (date: string | number | Date) =>
    new Date(date).toLocaleString(undefined, {dateStyle: "medium", timeStyle: "short"});

const shorten_key = (public_key: string) =>
    public_key.length > 20 ? `${public_key.slice(0, 8)}…${public_key.slice(-8)}` : public_key;

const PairedDevice = ({device}: {device: PairedDeviceInfo}) => {
    const channel = useChannel();

    const revoke = useCallback(
        async () => {
            if (!channel) return;

            const confirmed = await show_confirm({
                title: "Revoke device",
                message: `Are you sure you want to unpair and immediately disconnect ${device.name}?`,
                confirm_label: "Revoke",
                tone: "danger"
            });
            if (!confirmed) {
                return;
            }

            channel.send({action: "revoke_paired_device", payload: {public_key: device.public_key}});
        },
        [device.public_key, device.name, channel]
    );

    const retry_update = useCallback(
        () => channel?.send({action: "retry_client_update", payload: {public_key: device.public_key}}),
        [device.public_key, channel]
    );

    // the server offers its own version of the client, which is the editor's unless they're mismatched
    const client_outdated = device.client_version !== null && device.client_version !== editor_version;

    const last_seen_relative = useMemo(
        () => {
            if (!device.last_seen) return null;

            const diff = Date.now() - device.last_seen;
            const seconds = Math.floor(diff / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);

            if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
            if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
            if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
            return `${seconds} second${seconds > 1 ? "s" : ""} ago`;
        },
        [device.last_seen]
    );

    return (
        <div className="card card-border bg-base-100 w-full">
            <div className="card-body flex-row items-center gap-4 p-4">
                <div className="relative shrink-0">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary">
                        <CustomDynamicIcon name="pi-tray" className="w-6 h-6"/>
                    </div>
                    <span
                        className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-base-100 ${device.online ? "bg-success" : "bg-base-300"}`}
                        title={device.online ? "Online" : "Offline"}
                    />
                </div>

                <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <span className="font-semibold text-base truncate">{device.name}</span>

                    <span
                        className="flex items-center gap-1 text-xs font-mono text-base-content/60"
                        title={device.public_key}
                    >
                        <KeyRound className="w-3 h-3 shrink-0"/>
                        {shorten_key(device.public_key)}
                    </span>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-base-content/60">
                        <span>Paired {format_date(device.paired_at)}</span>
                        {device.online ? (
                            <span className="flex items-center gap-1 text-success font-medium">
                                <span className="w-2 h-2 rounded-full bg-success"/>
                                Online
                            </span>
                        ) : (
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3"/>
                                {device.last_seen ? `Last seen ${format_date(device.last_seen)} (${last_seen_relative})` : "Never seen"}
                            </span>
                        )}
                        {device.client_version ? (
                            <span
                                className={client_outdated ? "text-warning" : undefined}
                                title={client_outdated ? `This editor is ${editor_version}` : undefined}
                            >
                                Client v{device.client_version}{client_outdated && " (not the latest)"}
                            </span>
                        ) : (
                            <span className="opacity-50 italic">Client version unknown</span>
                        )}
                    </div>

                    {device.rejected_update && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-warning">
                            <TriangleAlert className="w-3 h-3 shrink-0"/>
                            <span>Update to {device.rejected_update} didn't start, so it was rolled back</span>
                            <button
                                className="btn btn-xs btn-warning btn-outline"
                                onClick={retry_update}
                                disabled={!channel || !device.online}
                                title={device.online ? undefined : "The device needs to be online to retry"}
                            >
                                Retry
                            </button>
                        </div>
                    )}
                </div>

                <button
                    className="btn btn-ghost btn-sm text-error"
                    onClick={revoke}
                    disabled={!channel}
                >
                    <Trash2 className="w-4 h-4"/>
                    Revoke
                </button>
            </div>
        </div>
    );
};

export const DevicesPage = () => {
    const channel = useChannel();

    const [devices, setDevices] = useState<PairedDeviceInfo[] | null>(null);
    useEffect(() => {
        if (!channel) return;

        const unsubscribe = channel.subscribe((msg) => {
            if (msg.action === "paired_devices") {
                setDevices(msg.payload);
            }
        });

        channel.send({action: "list_paired_devices"});

        return () => unsubscribe();
    }, [channel]);

    const refresh_list = useCallback(
        () => {
            if (!channel) return;

            setDevices(null);
            channel.send({action: "list_paired_devices"});
        },
        [channel]
    );

    const reload_clients = useCallback(
        () => channel?.send({action: "reload"}),
        [channel]
    );

    const is_loading = devices === null;

    return (
        <div className="flex flex-col gap-4 w-full h-full max-h-full overflow-y-none">
            <div className="flex flex-wrap gap-2 items-center justify-between w-full">
                <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold">Devices</h1>
                    {devices && <span className="badge badge-neutral badge-sm">{devices.length}</span>}
                </div>

                <div className="flex gap-2">
                    <button
                        className="btn btn-ghost btn-square"
                        onClick={refresh_list}
                        disabled={is_loading || !channel}
                        title="Refresh list"
                    >
                        <RefreshCw className={`w-4 h-4 ${is_loading ? "animate-spin" : ""}`}/>
                    </button>

                    <Link href="/devices/pair" className="btn btn-primary">
                        <Plus className="w-4 h-4"/>
                        Pair new device
                    </Link>
                </div>
            </div>

            <div className="flex flex-col w-full h-full gap-2 max-h-full overflow-y-auto">
                {is_loading ? (
                    <div className="flex items-center h-full justify-center py-10">
                        <span className="loading loading-spinner loading-md"/>
                    </div>
                ) : devices.length > 0 ? (
                    <div className="flex flex-col gap-2 w-full h-full overflow-y-auto px-4 py-1">
                        {devices.map((device) => (
                            <PairedDevice device={device} key={device.public_key}/>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center gap-2 py-10 h-full rounded-box border border-dashed border-base-300 text-base-content/60">
                        <MonitorSmartphone className="w-8 h-8"/>
                        <span>No paired devices yet</span>
                    </div>
                )}
            </div>

            <div className="divider my-0"/>

            <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/60">
                <button className="btn btn-ghost btn-sm" onClick={reload_clients} disabled={!channel}>
                    <RotateCcw className="w-4 h-4"/>
                    Reload all clients
                </button>
            </div>
        </div>
    );
};