import {useEffect, useMemo, useState} from "react";

import {default_server_config, ServerConfig, validate_server_config} from "@pi-tray/server-config";

import {useSupervisor} from "../contexts/SupervisorProvider";
import {load_server_config, save_server_config} from "../util/server_config";

// what's being typed, kept as text so a half typed port or network isn't thrown away
interface ConfigDraft {
    host: string;
    port: string;
    allowed_networks: string;
}

const to_draft = (config: ServerConfig): ConfigDraft => ({
    host: config.host,
    port: String(config.port),
    allowed_networks: config.allowed_networks.join("\n")
});

const from_draft = (draft: ConfigDraft) => ({
    host: draft.host.trim(),
    port: draft.port.trim() === "" ? undefined : Number(draft.port),
    allowed_networks: draft.allowed_networks.split("\n").map((line) => line.trim()).filter((line) => line !== "")
});

const LOCAL_ONLY_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * Edits the server's host, port and allowed networks in its settings file, restarting it to apply them if it's running.
 * @returns the element
 */
export const ServerConfigForm = () => {
    const supervisor = useSupervisor();

    const [saved, setSaved] = useState<ServerConfig | null>(null);
    const [draft, setDraft] = useState<ConfigDraft | null>(null);
    const [file_problems, setFileProblems] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [save_error, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        load_server_config()
            .then(({config, problems}) => {
                setSaved(config);
                setDraft(to_draft(config));
                setFileProblems(problems);
            })
            .catch((error) => setSaveError(`Couldn't read the server's settings: ${error instanceof Error ? error.message : String(error)}`));
    }, []);

    // the server's own rules, so anything accepted here is used as typed rather than replaced by a default
    const checked = useMemo(() => {
        if (!draft) {
            return null;
        }

        const candidate = from_draft(draft);
        const {config, problems} = validate_server_config(candidate);

        if (candidate.port === undefined) {
            problems.push("port is needed");
        }

        return {config, problems};
    }, [draft]);

    const changed = !!checked && !!saved && JSON.stringify(checked.config) !== JSON.stringify(saved);
    const is_default_networks = !!checked && JSON.stringify(checked.config.allowed_networks) === JSON.stringify(default_server_config().allowed_networks);
    const server_running = supervisor.connection === "connected" && supervisor.status?.state === "running";

    if (!draft || !checked) {
        return save_error ? <p className="text-sm text-error">{save_error}</p> : <p className="opacity-70">Loading...</p>;
    }

    const update = (field: keyof ConfigDraft, value: string) => {
        setSaveError(null);
        setDraft({...draft, [field]: value});
    };

    const save = async () => {
        setSaving(true);
        setSaveError(null);

        try {
            await save_server_config(checked.config);
            setSaved(checked.config);
            setFileProblems([]);

            if (server_running) {
                await supervisor.run_action("restart");
            }
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : String(error));
        } finally {
            setSaving(false);
        }
    };

    const reset = () => {
        setSaveError(null);
        setDraft(to_draft(default_server_config()));
    };

    return (
        <div className="flex flex-col gap-3 w-full max-w-md">
            {file_problems.length > 0 && (
                <div className="text-sm text-warning">
                    <p>Some of the saved settings were ignored, so the defaults are shown for them:</p>
                    <ul className="list-disc pl-5">
                        {file_problems.map((problem) => <li key={problem}>{problem}</li>)}
                    </ul>
                </div>
            )}

            <div className="grid grid-cols-[1fr_8rem] gap-3">
                <label className="flex flex-col gap-1">
                    <span>Host</span>
                    <input
                        type="text"
                        className="input input-bordered"
                        value={draft.host}
                        placeholder="0.0.0.0"
                        onChange={(event) => update("host", event.target.value)}
                    />
                </label>

                <label className="flex flex-col gap-1">
                    <span>Port</span>
                    <input
                        type="number"
                        className="input input-bordered"
                        min={1}
                        max={65535}
                        value={draft.port}
                        placeholder="31415"
                        onChange={(event) => update("port", event.target.value)}
                    />
                </label>
            </div>

            <span className="text-xs opacity-70 -mt-1">
                {LOCAL_ONLY_HOSTS.has(draft.host.trim())
                    ? "Only this PC can connect, so your Pi won't be able to reach the server."
                    : "0.0.0.0 listens on every network this PC is on. Your Pi's pi-tray.txt has to use the same port."}
            </span>

            <details className="group">
                <summary className="cursor-pointer text-sm opacity-80 hover:opacity-100">
                    Advanced: allowed networks ({is_default_networks ? "defaults, this PC and private networks" : `${checked.config.allowed_networks.length} custom`})
                </summary>

                <label className="flex flex-col gap-1 mt-2">
                    <textarea
                        className="textarea textarea-bordered font-mono text-sm"
                        rows={Math.max(4, draft.allowed_networks.split("\n").length)}
                        value={draft.allowed_networks}
                        onChange={(event) => update("allowed_networks", event.target.value)}
                    />
                    <span className="text-xs opacity-70">
                        One network per line, like 192.168.0.0/16. Connections from anywhere else are refused before they can pair.
                    </span>
                </label>
            </details>

            {checked.problems.length > 0 && (
                <ul className="text-sm text-error list-disc pl-5">
                    {checked.problems.map((problem) => <li key={problem}>{problem}</li>)}
                </ul>
            )}

            {checked.config.allowed_networks.length === 0 && checked.problems.length === 0 && (
                <p className="text-sm text-warning">With no allowed networks, every connection is refused, including the editor's.</p>
            )}

            <div className="flex gap-2">
                <button
                    className="btn btn-primary"
                    disabled={!changed || checked.problems.length > 0 || saving || supervisor.pending_action !== null}
                    onClick={() => void save()}
                >
                    {server_running ? "Save and restart" : "Save"}
                </button>

                <button className="btn btn-ghost" disabled={saving} onClick={reset}>
                    Reset to defaults
                </button>
            </div>

            {!server_running && changed && <p className="text-xs opacity-70">These are used the next time the server starts.</p>}
            {save_error && <p className="text-sm text-error">{save_error}</p>}
        </div>
    );
}