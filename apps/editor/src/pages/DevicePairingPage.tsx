import {CodeEntry} from "../components/CodeEntry";
import {useCallback, useEffect, useState} from "react";
import {Plus} from "lucide-react";
import {Link, useLocation} from "wouter";
import {useChannel} from "../contexts/WSProvider.tsx";
import {format_code, PAIRING_CODE_LENGTH} from "@pi-tray/secure-channel";

export const DevicePairingPage = () => {
    const [code, setCode] = useState("");
    const [name, setName] = useState("");

    const channel = useChannel();
    const pair_device = useCallback(
        () => {
            if (!channel) return;

            if (code.length !== PAIRING_CODE_LENGTH) {
                setInvalidCode(true);
                return;
            }

            const confirmation = confirm(`Are you sure you want to pair with the device using code ${format_code(code)}?`);
            if (!confirmation) {
                return;
            }

            channel.send({action: "submit_pairing_code", payload: {code, name}});
        },
        [channel, code, name]
    );

    const [invalid_code, setInvalidCode] = useState(false);

    // reset invalid code state when the code changes
    useEffect(() => {
        setInvalidCode(false);
    }, [code]);

    const [_, setLocation] = useLocation();

    useEffect(() => {
        if (!channel) return;

        const unsubscribe = channel.subscribe((msg) => {
            if (msg.action === "pairing_submit_result") {
                if (msg.payload === "paired") {
                    setLocation("/devices");
                } else if (msg.payload === "no_match") {
                    setInvalidCode(true);
                } else if (msg.payload === "collided") {
                    alert("Multiple devices are showing that code! Please try again shortly.");
                    setCode("");
                    setName("");
                }
            }
        });

        return () => unsubscribe();
    }, []);

    if (!channel) {
        return (
            <div className="flex flex-col gap-4 h-full w-full items-start justify-start">
                <h1 className="text-2xl font-bold">Pair new device</h1>
                <p className="text-lg">No connection to server...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 h-full w-full items-start justify-start">
            <h1 className="text-2xl font-bold">Pair new device</h1>

            <div className="flex flex-col items-center justify-center h-full w-full gap-10">
                <label className={`text-xl flex flex-col items-center justify-center gap-4 ${invalid_code ? "animate-shake" : ""}`}>
                    Enter the code displayed on the device you wish to pair:
                    <CodeEntry length={PAIRING_CODE_LENGTH} value={code} on_change={setCode} status={invalid_code ? "error" : "idle"} />
                </label>

                <label className="text-lg flex flex-col items-center justify-center gap-4">
                    Enter a name for the new device, or leave blank to use the default:
                    <input type="text" placeholder="Device name" className="input input-bordered w-full max-w-xs" value={name} onChange={(e) => setName(e.target.value)} />
                </label>

                <button className="btn btn-primary text-lg" onClick={pair_device}>
                    <Plus className="w-4 h-4 mr-1"/>
                    Pair device
                </button>
            </div>

            <Link href="/devices" className="btn btn-ghost text-lg mx-auto mb-10">
                Cancel pairing
            </Link>
        </div>
    );
}
