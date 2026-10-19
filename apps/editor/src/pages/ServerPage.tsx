import {useState} from "react";
import {Check, Circle, Ellipsis, Eye, RotateCcw, Server, Tally1, TriangleAlert, X} from "lucide-react";
import {Link} from "wouter";

import {SupervisorControl, useSupervisor} from "../contexts/SupervisorProvider";
import {useAutostart} from "../util/autostart";
import {ServerConfigForm} from "../components/ServerConfigForm.tsx";
import {show_confirm} from "../util/dialogs.ts";
import {editor_version} from "../version.ts";

interface ServerSummary {
    text: string;

    /** Shown under the text, e.g. when it started or why it stopped */
    detail: string | null;

    tone: "pending" | "success" | "neutral" | "warning" | "error";
}

const TONE_CLASSES: Record<ServerSummary["tone"], string> = {
    pending: "bg-gray-500",
    success: "bg-success",
    neutral: "bg-gray-500",
    warning: "bg-warning",
    error: "bg-error"
};

const PENDING_TEXT: Record<NonNullable<SupervisorControl["pending_action"]>, string> = {
    start: "Starting Pi-Tray...",
    launch: "Starting Pi-Tray...",
    stop: "Stopping the server...",
    quit: "Stopping Pi-Tray...",
    restart: "Restarting the server..."
};

const format_time = (iso: string) => new Date(iso).toLocaleString();

const describe_exit = (exit: {code: number | null, signal: string | null, at: string}) => {
    return `Last exited ${exit.signal ? `from ${exit.signal}` : `with code ${exit.code}`} at ${format_time(exit.at)}`;
}

const summarise = (supervisor: SupervisorControl): ServerSummary => {
    if (supervisor.pending_action) {
        return {text: PENDING_TEXT[supervisor.pending_action], detail: null, tone: "pending"};
    }

    if (supervisor.connection === "connecting") {
        return {text: "Checking...", detail: null, tone: "pending"};
    }

    if (supervisor.connection === "not_running" || !supervisor.status) {
        return {
            text: "Pi-Tray isn't running.",
            detail: "Your Pi can't do anything until it's started.",
            tone: "error"
        };
    }

    const {state, started_at, last_exit} = supervisor.status;

    switch (state) {
        case "running":
            return {
                text: "The server is running!",
                detail: started_at ? `Since ${format_time(started_at)}` : null,
                tone: "success"
            };
        case "stopped":
            return {
                text: "The server is stopped.",
                detail: last_exit ? describe_exit(last_exit) : null,
                tone: "neutral"
            };
        case "waiting_to_restart":
            return {
                text: "The server crashed, and will restart shortly.",
                detail: last_exit ? describe_exit(last_exit) : null,
                tone: "warning"
            };
        case "failed":
            return {
                text: "The server kept crashing, so it was stopped.",
                detail: last_exit ? `${describe_exit(last_exit)}. Check the server logs for why.` : "Check the server logs for why.",
                tone: "error"
            };
    }
}

const SummaryIcon = ({tone}: {tone: ServerSummary["tone"]}) => {
    switch (tone) {
        case "pending":
            return <Ellipsis className="min-w-4 h-4" />;
        case "success":
            return <Check className="min-w-4 h-4" />;
        case "warning":
            return <TriangleAlert className="min-w-4 h-4" />;
        default:
            return <X className="min-w-4 h-4" />;
    }
}

export const ServerPage = () => {
    const supervisor = useSupervisor();
    const autostart = useAutostart();

    const [action_error, setActionError] = useState<string | null>(null);

    const summary = summarise(supervisor);

    const busy = supervisor.pending_action !== null || supervisor.connection === "connecting";
    const supervisor_running = supervisor.connection === "connected";
    const server_state = supervisor.status?.state ?? null;

    // the server is up, or the supervisor is about to bring it back up by itself
    const server_up = server_state === "running" || server_state === "waiting_to_restart";

    const run = async (task: () => Promise<void>) => {
        setActionError(null);

        try {
            await task();
        } catch (error) {
            setActionError(error instanceof Error ? error.message : String(error));
        }
    }

    const confirm_stop = async () => {
        const comes_back = autostart.enabled
            ? "It starts again automatically when you log in, or you can start it here at any time."
            : "You can start it again here at any time.";

        const confirmed = await show_confirm({
            title: "Stop Pi-Tray?",
            message: `Your Pi will disconnect and its buttons won't do anything until Pi-Tray is started again. ${comes_back}`,
            confirm_label: "Stop",
            tone: "danger"
        });

        if (confirmed) {
            void run(supervisor.stop);
        }
    }

    return (
        <div className="flex flex-col gap-10 items-start justify-start pb-8">
            <h1 className="text-2xl font-bold">Server</h1>

            <div className="flex items-center gap-3">
                <div className={`${TONE_CLASSES[summary.tone]} p-4 rounded-full w-2 h-2 flex items-center justify-center text-white`}>
                    <SummaryIcon tone={summary.tone} />
                </div>

                <div className="flex flex-col justify-center h-12">
                    <span className="font-bold">{summary.text}</span>
                    {summary.detail && <span className="text-sm opacity-70">{summary.detail}</span>}
                </div>
            </div>

            {supervisor.version_mismatch && (
                <div role="alert" className="alert alert-warning">
                    <TriangleAlert className="w-5 h-5" />
                    <span>
                        The background service is running Pi-Tray {supervisor.version ?? "from an older version"}, but this editor is {editor_version}.
                        Stop and start it to run this version.
                    </span>
                </div>
            )}

            <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold">Actions</h2>

                <div className="flex gap-4">
                    <div className="join">
                        <button
                            className="btn join-item"
                            disabled={busy || !supervisor_running}
                            onClick={confirm_stop}
                        >
                            <Circle className="mr-2" /> Stop
                        </button>
                        <button
                            className="btn join-item"
                            disabled={busy || server_up}
                            onClick={() => void run(supervisor.start)}
                        >
                            <Tally1 /> Start
                        </button>
                    </div>

                    <button
                        className="btn"
                        disabled={busy || !supervisor_running}
                        onClick={() => void run(() => supervisor.run_action("restart"))}
                    >
                        <RotateCcw className="mr-2" /> Restart
                    </button>
                </div>

                {action_error && <p className="text-sm text-error">{action_error}</p>}
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
                </div>

                <ServerConfigForm />
            </div>

            <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold">Logs</h2>

                <div className="flex gap-2">
                    <Link href="/devtools/logs/server" className="btn btn-outline">
                        <Server className="mr-2" />
                        View server logs
                    </Link>

                    <Link href="/devtools/logs/supervisor" className="btn btn-outline">
                        <Eye className="mr-2" />
                        View supervisor logs
                    </Link>
                </div>
            </div>
        </div>
    );
}