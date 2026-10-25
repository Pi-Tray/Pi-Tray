import {useCallback, useEffect} from "react";
import type {ServerMessage} from "@pi-tray/types";

import {useChannel, useChannelMessage, useChannelReady} from "../contexts/WSContext";
import {client_version} from "../version";

const UPDATER_URL = "http://127.0.0.1:31416/";
const RETRY_URL = "http://127.0.0.1:31416/retry";

// a connection that keeps dropping would otherwise ask after every reconnect
const CHECK_COOLDOWN_MS = 60_000;

// a compatible update waits for this long without a press, so it never reloads under someone's finger
const IDLE_BEFORE_RELOAD_MS = 60_000;
const IDLE_CHECK_INTERVAL_MS = 5_000;

/**
 * What pi-tray-update-trigger answers once the check has finished.
 */
interface UpdaterReply {
    installed: boolean;

    /** <built_at>-<version> of the newly installed client */
    release?: string;

    /** <built_at>-<version> of the server's client, which failed to start last time so wasn't installed */
    rejected?: string;

    /** the check failed, the pi's journal says why */
    failed?: boolean;
}

// kept outside react, so they last for as long as this page does whatever re-renders
let last_check_at = 0;
let checking = false;
let last_interaction_at = Date.now();
let reload_when_idle = false;

// what the server was last told, so it's only told again when it changes. undefined until the updater has answered,
// so a fresh page doesn't clear what the server knows before it knows any better
let rejected_update: string | null | undefined = undefined;

// before 1.0 a minor release can break things too, so 0.3 and 0.4 count as different lines, as semver allows
const compatibility_line = (version: string) => {
    const [major, minor] = version.split(".");
    return major === "0" ? `0.${minor}` : major;
}

const version_of_release = (release: string) => release.slice(release.indexOf("-") + 1);

const reload_into_update = () => {
    // the updater's verify gives the new client a few minutes to log in from here, or puts this one back
    console.log("pi-tray client reloading into the update");
    location.reload();
}

/**
 * Asks the pi's updater to check for an update, reloading into it once it's installed.
 * @param retry first forget that the server's client failed to start, so it's installed again
 * @returns the updater's reply, or null if it wasn't asked or couldn't be reached
 */
const check_for_update = async (retry: boolean): Promise<UpdaterReply | null> => {
    // a retry is a person asking, so it skips the cooldown
    if (checking || (!retry && Date.now() - last_check_at < CHECK_COOLDOWN_MS)) {
        return null;
    }

    checking = true;
    last_check_at = Date.now();

    try {
        // answers once the update has been checked, and installed if there was one, which can take a while
        const response = await fetch(retry ? RETRY_URL : UPDATER_URL, {method: "POST"});
        const reply = await response.json() as UpdaterReply;

        if (reply.failed) {
            console.warn("The client update check failed, see journalctl -u 'pi-tray-update@*' on the pi");
        }

        if (reply.rejected) {
            console.warn(`Client ${version_of_release(reply.rejected)} failed to start last time, so it wasn't installed`);
        }

        if (!reply.installed || !reply.release) {
            return reply;
        }

        const new_version = version_of_release(reply.release);

        if (compatibility_line(new_version) !== compatibility_line(client_version)) {
            // the server that offered it is newer, and this client may not understand it
            console.log(`Client ${new_version} installed, reloading now as ${client_version} may not work with the server`);
            reload_into_update();
        } else {
            console.log(`Client ${new_version} installed, reloading once nobody has pressed anything for a minute`);
            reload_when_idle = true;
        }

        return reply;
    } catch (error) {
        // not on a pi, or its updater isn't running. the next login asks again
        console.log("Couldn't reach the client updater:", error);
        return null;
    } finally {
        checking = false;
    }
}

/**
 * Keeps the pi's client up to date with the server's: after each login, asks the pi's updater to check, and reloads into
 * the new client once it's installed, straight away if it might not work with the server, otherwise once idle.<br>
 * Also tells the server which version this is, and about an update that failed to start, which the editor can retry.<br>
 * Use once, inside the WSProvider.
 */
export const useClientUpdates = () => {
    // stable, so the callbacks below are too and don't run again on every render
    const send = useChannel()?.send;

    const check_and_report = useCallback(async (retry: boolean) => {
        const reply = await check_for_update(retry);

        // only a reply says anything about rejection, a check that didn't happen leaves it as it was
        if (!reply || !send) {
            return;
        }

        const now_rejected = reply.rejected ? version_of_release(reply.rejected) : null;
        if (now_rejected !== rejected_update) {
            rejected_update = now_rejected;
            send({action: "client_info", payload: {version: client_version, rejected_update}});
        }
    }, [send]);

    const on_ready = useCallback(() => {
        // the updater's verify looks for this in the console log, as proof a new client loaded and logged in
        console.log(`pi-tray client ready ${client_version}`);

        send?.({action: "client_info", payload: rejected_update === undefined ? {version: client_version} : {version: client_version, rejected_update}});
        void check_and_report(false);
    }, [send, check_and_report]);

    useChannelReady(on_ready);

    const on_message = useCallback((message: ServerMessage) => {
        if (message.action === "retry_client_update") {
            console.log("Retrying the client update, as the editor asked");
            void check_and_report(true);
        }
    }, [check_and_report]);

    useChannelMessage(on_message);

    useEffect(() => {
        const note_interaction = () => {
            last_interaction_at = Date.now();
        };

        window.addEventListener("pointerdown", note_interaction, {passive: true});
        window.addEventListener("keydown", note_interaction, {passive: true});

        const idle_timer = setInterval(() => {
            if (reload_when_idle && Date.now() - last_interaction_at >= IDLE_BEFORE_RELOAD_MS) {
                reload_into_update();
            }
        }, IDLE_CHECK_INTERVAL_MS);

        return () => {
            window.removeEventListener("pointerdown", note_interaction);
            window.removeEventListener("keydown", note_interaction);
            clearInterval(idle_timer);
        };
    }, []);
}
