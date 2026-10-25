import {useCallback, useEffect} from "react";

import {useChannelReady} from "../contexts/WSContext";
import {client_version} from "../version";

const UPDATER_URL = "http://127.0.0.1:31416/";

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

    /** the check failed, the pi's journal says why */
    failed?: boolean;
}

// kept outside react, so they last for as long as this page does whatever re-renders
let last_check_at = 0;
let checking = false;
let last_interaction_at = Date.now();
let reload_when_idle = false;

// before 1.0 a minor release can break things too, so 0.3 and 0.4 count as different lines, as semver allows
const compatibility_line = (version: string) => {
    const [major, minor] = version.split(".");
    return major === "0" ? `0.${minor}` : major;
}

const version_of_release = (release: string) => release.slice(release.indexOf("-") + 1);

const check_for_update = async () => {
    if (checking || Date.now() - last_check_at < CHECK_COOLDOWN_MS) {
        return;
    }

    checking = true;
    last_check_at = Date.now();

    try {
        // answers once the update has been checked, and installed if there was one, which can take a while
        const response = await fetch(UPDATER_URL, {method: "POST"});
        const reply = await response.json() as UpdaterReply;

        if (reply.failed) {
            console.warn("The client update check failed, see journalctl -u 'pi-tray-update@*' on the pi");
        }

        if (!reply.installed || !reply.release) {
            return;
        }

        const new_version = version_of_release(reply.release);

        if (compatibility_line(new_version) !== compatibility_line(client_version)) {
            // the server that offered it is newer, and this client may not understand it
            console.log(`Client ${new_version} installed, reloading now as ${client_version} may not work with the server`);
            location.reload();
        } else {
            console.log(`Client ${new_version} installed, reloading once nobody has pressed anything for a minute`);
            reload_when_idle = true;
        }
    } catch (error) {
        // not on a pi, or its updater isn't running. the next login asks again
        console.log("Couldn't reach the client updater:", error);
    } finally {
        checking = false;
    }
}

/**
 * Keeps the pi's client up to date with the server's: after each login, asks the pi's updater to check, and reloads into
 * the new client once it's installed, straight away if it might not work with the server, otherwise once idle.<br>
 * Use once, inside the WSProvider.
 */
export const useClientUpdates = () => {
    const on_ready = useCallback(() => {
        // the updater's rollback looks for this in the console log, as proof a new client loaded and connected
        console.log(`pi-tray client ready ${client_version}`);
        void check_for_update();
    }, []);

    useChannelReady(on_ready);

    useEffect(() => {
        const note_interaction = () => {
            last_interaction_at = Date.now();
        };

        window.addEventListener("pointerdown", note_interaction, {passive: true});
        window.addEventListener("keydown", note_interaction, {passive: true});

        const idle_timer = setInterval(() => {
            if (reload_when_idle && Date.now() - last_interaction_at >= IDLE_BEFORE_RELOAD_MS) {
                console.log("Reloading into the updated client");
                location.reload();
            }
        }, IDLE_CHECK_INTERVAL_MS);

        return () => {
            window.removeEventListener("pointerdown", note_interaction);
            window.removeEventListener("keydown", note_interaction);
            clearInterval(idle_timer);
        };
    }, []);
}
