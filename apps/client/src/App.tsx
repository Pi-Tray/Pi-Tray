import {WSProvider} from "./contexts/WSContext";
import {WSStatus} from "./components/WSStatus";
import {PageName} from "./components/PageName";

import {WSPushButtonGrid} from "./components/PushButtonGrid";
import {PairingUI} from "./components/PairingUI";

import "./style/App.css";
import {useClientUpdates} from "./util/client_update.ts";

const ClientUpdates = () => {
    useClientUpdates();
    return null;
}

export default function App() {
    // TODO: default is useful for dev but for prod it should probably be erroneous? and what if dev server uses other port?
    const ws_url = new URLSearchParams(location.search).get("ws") || import.meta.env.VITE_DEFAULT_WS_URL || "ws://localhost:31415";

    return (
        <WSProvider url={ws_url}>
            <ClientUpdates />

            <WSStatus />
            <PageName />
            <PairingUI />

            <WSPushButtonGrid className="grid" />
        </WSProvider>
    );
}
