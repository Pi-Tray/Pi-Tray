import {useWebSocket} from "../../contexts/WSProvider";
import {useCallback} from "react";
import {Link} from "wouter";
import {ArrowLeft} from "lucide-react";

export const DevToolsPluginsPage = () => {
    const ws = useWebSocket();

    const reload_all_plugins = useCallback(
        () => {
            ws?.send(JSON.stringify({action: "reload_plugins"}));
        },
        [ws]
    );

    return (
        <div className="h-full w-full flex flex-col">
            <div className="flex items-center gap-2">
                <Link href="/devtools" className="btn btn-ghost btn-sm btn-square" title="Back to DevTools">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <h1 className="text-2xl font-bold">Plugin Management</h1>
            </div>

            <div className="flex flex-col gap-2 mt-4">
                <button className="btn" onClick={reload_all_plugins} title="Has the server re-cache all plugins. Note that plugins already re-cache on update.">Reload all plugins</button>
            </div>
        </div>
    );
}
