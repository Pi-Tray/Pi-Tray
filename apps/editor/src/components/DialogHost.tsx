import {useEffect, useRef, useState, useSyncExternalStore} from "react";

import {dismiss_dialog, get_dialog_queue, subscribe_dialogs, type DialogRequest} from "../util/dialogs.ts";

/**
 * Renders queued {@link show_alert}/{@link show_confirm} requests as daisyui modals.<br>
 * Mount it once near the root; it shows one request at a time and resolves each as the user responds.
 * @returns the element
 */
export const DialogHost = () => {
    const queue = useSyncExternalStore(subscribe_dialogs, get_dialog_queue);
    const current = queue[0] ?? null;

    const dialog_ref = useRef<HTMLDialogElement>(null);
    const confirm_button_ref = useRef<HTMLButtonElement>(null);

    // keep showing the last request while the dialog animates closed, so its contents don't blank out mid-transition
    const [rendered, setRendered] = useState<DialogRequest | null>(null);
    useEffect(() => {
        if (current) {
            setRendered(current);
        }
    }, [current]);

    // open or close the native dialog to match the queue, and treat a close we didn't trigger (escape, backdrop) as a cancel
    useEffect(() => {
        const dialog = dialog_ref.current;
        if (!dialog) {
            return;
        }

        if (current && !dialog.open) {
            dialog.showModal();
        } else if (!current && dialog.open) {
            dialog.close();
        }

        const on_close = () => {
            if (current) {
                dismiss_dialog(current.id, false);
            }
        };

        dialog.addEventListener("close", on_close);
        return () => dialog.removeEventListener("close", on_close);
    }, [current]);

    // focus the primary button when a new request appears, so enter confirms and the dialog is keyboard-ready
    useEffect(() => {
        if (current) {
            confirm_button_ref.current?.focus();
        }
    }, [current?.id]);

    const display = current ?? rendered;

    return (
        <dialog ref={dialog_ref} className="modal">
            <div className="modal-box flex flex-col gap-4">
                {display && (
                    <>
                        {display.title && <h3 className="text-lg font-bold">{display.title}</h3>}

                        <p className="whitespace-pre-line text-sm text-base-content/80">{display.message}</p>

                        <div className="modal-action mt-0">
                            {display.kind === "confirm" && (
                                <button className="btn btn-ghost" onClick={() => dismiss_dialog(display.id, false)}>
                                    {display.cancel_label}
                                </button>
                            )}

                            <button
                                ref={confirm_button_ref}
                                className={`btn ${display.tone === "danger" ? "btn-error" : "btn-primary"}`}
                                onClick={() => dismiss_dialog(display.id, true)}
                            >
                                {display.confirm_label}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* clicking the backdrop closes the dialog, which the close handler treats as a cancel */}
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
}
