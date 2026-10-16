import {useChannel} from "../contexts/WSProvider.tsx";

export const DevicePage = () => {
    const channel = useChannel();

    return (<>
        <h1 className="text-2xl font-bold">Device</h1>
        <p>(This page is WIP)</p>
        <button className="btn" onClick={() => channel?.send({action: "reload"})}>Reload clients</button>
    </>);
}
