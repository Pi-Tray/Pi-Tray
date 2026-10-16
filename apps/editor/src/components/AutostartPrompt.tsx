import {useCallback, useEffect, useRef, useState} from "react";
import {Command} from "@tauri-apps/plugin-shell";
import {get_config, set_config} from "../util/config.ts";

export const AutostartPrompt = () => {
    const dialog_ref = useRef<HTMLDialogElement>(null);

    const [open, setOpen] = useState(false);

    // on first mount, check if already asked/already enabled
    const is_first_mount = useRef(true);
    useEffect(() => {
        if (!is_first_mount.current) {
            return;
        }
        is_first_mount.current = false;

        // never offer autostart from a dev build: enabling it would point the Run key / launch agent at the
        // throwaway target/debug sidecar, which then runs at login and locks the exe against the next build
        if (import.meta.env.DEV) {
            return;
        }

        (async () => {
            if (await get_config("autostart_prompted")) {
                // already asked, don't show again
                return;
            }

            // check with the sidecar if autostart is enabled
            try {
                const command = Command.sidecar("binaries/pi-tray-service", ["autostart", "status", "--json"]);
                const output = await command.execute();
                if (output.code === 0) {
                    const status = JSON.parse(output.stdout);
                    if (status.enabled) {
                        // already enabled, don't show again
                        set_config("autostart_prompted", true);
                        return;
                    }
                }
            } catch (error) {
                console.error("Failed to check autostart status:", error);
                return;
            }

            // show the prompt
            setOpen(true);
        })();
    }, []);

    useEffect(() => {
        const dialog = dialog_ref.current;
        if (!dialog) {
            return;
        }

        if (open && !dialog.open) {
            dialog.showModal();
        } else if (!open && dialog.open) {
            dialog.close();
        }
    }, [open]);

    const enable_autostart = useCallback(
        async () => {
            // guard again in case this is ever reached in a dev build: see the mount effect above
            if (import.meta.env.DEV) {
                console.warn("Skipping autostart enable in a dev build");
                return;
            }

            const command = Command.sidecar("binaries/pi-tray-service", ["autostart", "enable"]);
            const output = await command.execute();
            if (output.code === 0) {
                console.log("Autostart enabled");
            } else {
                console.error("Failed to enable autostart:", output.stderr);
            }

            set_config("autostart_prompted", true);
        },
        [],
    );

    const skip = useCallback(
        async () => {
            set_config("autostart_prompted", true);
        },
        [],
    );

    return (
        <dialog ref={dialog_ref} className="modal" onCancel={skip} onClose={() => setOpen(false)}>
            <div className="modal-box">
                <h3 className="font-bold text-lg">Autostart</h3>
                <p className="py-4">Do you want to start the Pi-Tray Server automatically when you log in to your computer?</p>
                <p className="py-4">This is recommended, as it allows Pi-Tray to control your computer without needing to start the server from the editor each boot.</p>
                <p className="py-4">You can change this setting any time in the Settings tab of the editor.</p>
                <div className="modal-action">
                    <form method="dialog" className="flex flex-row-reverse gap-2">
                        <button className="btn btn-primary" onClick={enable_autostart}>Yes (recommended)</button>
                        <button className="btn" onClick={skip}>No</button>
                    </form>
                </div>
            </div>
        </dialog>
    );
}
