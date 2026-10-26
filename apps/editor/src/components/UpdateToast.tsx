import {AnimatePresence, motion} from "motion/react";
import {openUrl} from "@tauri-apps/plugin-opener";

import {UpdateState, useUpdates} from "../contexts/UpdateProvider";

const release_url = (version: string) => `https://github.com/Pi-Tray/Pi-Tray/releases/tag/v${version}`;

export const open_release_notes = (version: string) => {
    openUrl(release_url(version)).catch((error) => console.error("Couldn't open the release notes:", error));
}

/**
 * How far along downloading or installing an update is, or nothing for any other state.
 */
export const UpdateProgress = ({state}: {state: UpdateState}) => {
    if (state.kind === "installing") {
        return (
            <div className="flex items-center gap-2 text-sm">
                <span className="loading loading-spinner loading-xs"/>
                Installing, Pi-Tray will reopen by itself...
            </div>
        );
    }

    if (state.kind !== "downloading") {
        return null;
    }

    const downloaded_mb = (state.downloaded_bytes / 1024 / 1024).toFixed(1);

    // the server doesn't always say how big the download is, then it's a bar with no end
    return (
        <div className="flex flex-col gap-1 text-sm w-full">
            {state.total_bytes ? (
                <progress className="progress progress-primary w-full" value={state.downloaded_bytes} max={state.total_bytes}/>
            ) : (
                <progress className="progress progress-primary w-full"/>
            )}
            <span className="text-base-content/60 text-xs">
                Downloading {downloaded_mb} MB{state.total_bytes ? ` of ${(state.total_bytes / 1024 / 1024).toFixed(1)} MB` : ""}
            </span>
        </div>
    );
}

/**
 * Says when a newer Pi-Tray is available, once per version. Dismissing it leaves the settings page and its nav badge
 * as the reminder.
 */
export const UpdateToast = () => {
    const {state, available_version, dismissed, install, dismiss} = useUpdates();

    const busy = state.kind === "downloading" || state.kind === "installing";
    const install_failed = state.kind === "error" && state.failed === "install";

    // a failed check someone asked for is shown on the settings page, where they asked
    const visible = available_version !== null && (busy || (!dismissed && (state.kind === "available" || install_failed)));

    return (
        <div className="toast toast-top toast-end z-50">
            <AnimatePresence>
                {visible && (
                    <motion.div
                        initial={{opacity: 0, y: -16}}
                        animate={{opacity: 1, y: 0}}
                        exit={{opacity: 0, y: -16}}
                        className="card card-border bg-base-200 shadow-lg w-80"
                    >
                        <div className="card-body gap-2 p-4">
                            <span className="font-semibold">Pi-Tray {available_version} is available</span>

                            {busy ? (
                                <UpdateProgress state={state}/>
                            ) : (
                                <>
                                    {state.kind === "error" && state.failed === "install" ? (
                                        <span className="text-sm text-error">{state.message}</span>
                                    ) : (
                                        <span className="text-sm text-base-content/70">
                                            Updating restarts Pi-Tray, so your devices reconnect after a few seconds.
                                        </span>
                                    )}

                                    <div className="flex items-center justify-between gap-2 mt-1">
                                        <button className="btn btn-link btn-sm px-0" onClick={() => open_release_notes(available_version)}>
                                            What's new
                                        </button>

                                        <div className="flex gap-2">
                                            <button className="btn btn-ghost btn-sm" onClick={dismiss}>Later</button>
                                            <button className="btn btn-primary btn-sm" onClick={install}>
                                                {install_failed ? "Try again" : "Update"}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
