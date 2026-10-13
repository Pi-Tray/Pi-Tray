import {useWebSocket} from "../contexts/WSProvider.tsx";

export const DevicePage = () => {
    const ws = useWebSocket();

    return (<>
        <h1 className="text-2xl font-bold">Device</h1>
        <p>(This page is WIP)</p>
        <button className="btn" onClick={() => ws?.send(JSON.stringify({action: "reload"}))}>Reload clients</button>
    </>);
}
