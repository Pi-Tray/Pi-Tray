import {WSProvider} from "./contexts/WSContext";
import {WSStatus} from "./components/WSStatus";

import {WSPushButtonGrid} from "./components/PushButtonGrid";

import "./style/App.css";

export default function App() {
    const ws_url = new URLSearchParams(location.search).get("ws") || import.meta.env.VITE_DEFAULT_WS_URL || "ws://localhost:8080";

    return (
        <WSProvider url={ws_url}>
            <WSStatus />

            <WSPushButtonGrid className="grid" />
        </WSProvider>
    );
}
