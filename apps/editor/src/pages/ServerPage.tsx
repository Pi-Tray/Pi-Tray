import {useMemo} from "react";
import {Check, Circle, Ellipsis, Eye, RotateCcw, Server, Tally1, X} from "lucide-react";
import {Link} from "wouter";

import {useSupervisor} from "../contexts/SupervisorProvider";
import {useAutostart} from "../util/autostart";

export const ServerPage = () => {
    const supervisor = useSupervisor();

    const is_running = useMemo(() => supervisor.status && supervisor.status.state === "running", [supervisor.status]);
    const is_pending = useMemo(() => !!supervisor.pending_action, [supervisor.pending_action]);

    const autostart = useAutostart();

    return (
        <div className="flex flex-col gap-10 items-start justify-start">
            <h1 className="text-2xl font-bold">Server</h1>

            <div className="flex items-center gap-3 font-bold">
                <div className={`${is_pending ? "bg-gray-500" : (is_running ? "bg-success" : "bg-error")} p-4 rounded-full w-2 h-2 flex items-center justify-center text-white`}>
                    {is_pending ? <Ellipsis className="min-w-4 h-4" /> : (is_running ? <Check className="min-w-4 h-4" /> : <X className="min-w-4 h-4" />)}
                </div>
                <span>{is_pending ? `Applying ${supervisor.pending_action} action...` : (is_running ? "The server is running!" : "The server is not running.")}</span>
            </div>

            <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold">Actions</h2>

                <div className="flex gap-4">
                    <div className="join">
                        <button
                            className="btn join-item"
                            disabled={!is_running || supervisor.pending_action === "stop" || supervisor.pending_action === "restart"}
                            onClick={() => supervisor.run_action("stop")}
                        >
                            <Circle className="mr-2" /> Stop
                        </button>
                        <button
                            className="btn join-item"
                            disabled={!!is_running || supervisor.pending_action === "start" || supervisor.pending_action === "restart"}
                            onClick={() => supervisor.run_action("start")}
                        >
                            <Tally1 /> Start
                        </button>
                    </div>

                    <button
                        className="btn"
                        disabled={supervisor.pending_action === "restart"}
                        onClick={() => supervisor.run_action("restart")}
                    >
                        <RotateCcw className="mr-2" /> Restart
                    </button>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold">Configuration</h2>

                <div className="flex flex-col gap-2">
                    <label className="label">
                        Autostart at login (recommended)
                        <input
                            type="checkbox"
                            className="toggle"
                            checked={autostart.enabled ?? false}
                            disabled={!autostart.changeable || autostart.pending || autostart.enabled === null}
                            onChange={(event) => autostart.set_enabled(event.target.checked)}
                            title={autostart.changeable ? undefined : "Can't be changed from a dev build"}
                        />
                    </label>
                    {autostart.error && <p className="text-xs text-error">{autostart.error}</p>}

                    TODO: host, port, allowed hosts
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold">Logs</h2>

                <div className="flex gap-2">
                    <Link href="/devtools/logs/server" className="btn btn-primary">
                        <Server className="mr-2" />
                        View server logs
                    </Link>

                    <Link to="/devtools/logs/supervisor" className="btn btn-primary">
                        <Eye className="mr-2" />
                        View supervisor logs
                    </Link>
                </div>
            </div>
        </div>
    );
}
