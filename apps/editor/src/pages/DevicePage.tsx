import {useChannel} from "../contexts/WSProvider.tsx";
import {useState} from "react";
import {PAIRING_CODE_LENGTH} from "@pi-tray/secure-channel";

export const DevicePage = () => {
    const channel = useChannel();

    const [code, setCode] = useState("");
    const [name, setName] = useState("");

    return (
        <div className="flex flex-col gap-2 items-start justify-start w-full">
            <h1 className="text-2xl font-bold">Device</h1>
            <p>(This page is WIP)</p>
            <button className="btn" onClick={() => channel?.send({action: "reload"})}>Reload clients</button>

            <div className="flex gap-2">
                <input className="input" maxLength={PAIRING_CODE_LENGTH} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter pairing code" />
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Device name (optional)" />
                <button className="btn" onClick={() => channel?.send({action: "submit_pairing_code", payload: {code, name}})}>Pair device</button>
            </div>
        </div>
    );
}

// TODO: fancier pairing ui with nice code slots and proper ux, this is just a test
// TODO: list paired devices and their status, revocation, name etc
