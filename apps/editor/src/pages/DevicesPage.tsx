import {useChannel} from "../contexts/WSProvider.tsx";
import {useCallback, useEffect, useState} from "react";
import {PairedDeviceInfo} from "@pi-tray/types";
import {Plus, RefreshCw} from "lucide-react";
import {Link} from "wouter";

const PairedDevice = ({device}: {device: PairedDeviceInfo}) => {
    const channel = useChannel();

    const revoke = useCallback(
        () => {
            if (!channel) return;

            if (!window.confirm(`Are you sure you want to unpair and immediately disconnect ${device.name}?`)) {
                return;
            }

            channel.send({action: "revoke_paired_device", payload: {public_key: device.public_key}});
        },
        [device.public_key, device.name, channel]
    );

    return (
        <div className="flex gap-1 p-2 border rounded w-full items-center justify-between">
            <div className="flex flex-col gap-1 w-full">
                <div className="flex gap-2 items-center">
                    <span className="font-bold">{device.name}</span>
                    <span className="text-sm text-gray-500">{device.public_key}</span>
                </div>
                <div className="text-sm">Paired at: {new Date(device.paired_at).toLocaleString()}</div>
                <div className="text-sm text-gray-500">Last seen: {device.last_seen ? new Date(device.last_seen).toLocaleString() : "Never"}</div>
            </div>

            <button className="btn btn-error" onClick={revoke}>Revoke</button>
        </div>
    )
}

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

    return (
        <div className="flex flex-col gap-2 items-start justify-start w-full">
            <div className="flex gap-2 items-center justify-between w-full">
                <h1 className="text-2xl font-bold">Devices</h1>

                <button className="btn" onClick={refresh_list} disabled={!devices || !channel}>
                    <RefreshCw className="w-4 h-4 mr-1"/>
                    {devices ? "Refresh list" : "Loading..."}
                </button>
            </div>

            <div className="flex flex-col w-full gap-2">
                {devices ?
                    devices.length > 0 ?
                        devices.map((device) => (
                            <PairedDevice device={device} key={device.public_key}/>
                        ))
                        : <div className="text-gray-500">No paired devices</div>
                    : "Loading..."
                }
            </div>

            <Link href="/devices/pair" className="btn">
                <Plus className="w-4 h-4 mr-1"/>
                Pair new device
            </Link>

            <button className="btn" onClick={() => channel?.send({action: "reload"})}>Reload clients</button>
        </div>
    );
}

// TODO: fancier pairing ui with nice code slots and proper ux, this is just a test
// TODO: list paired devices and their status, revocation, name etc
