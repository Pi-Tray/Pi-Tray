import {useEffect, useRef} from "react";

import {X} from "lucide-react";

import {AssetBrowser} from "./AssetBrowser";

interface AssetPickerDialogProps {
    open: boolean;
    onClose: () => void;
    onPick: (asset_id: string) => void;
    selected_id?: string | null;
}

/**
 * A dialog for choosing an asset, which can also upload new ones.<br>
 * Uploading a single file picks it straight away.
 * @param open whether the dialog is shown
 * @param onClose called when the dialog closes, must be stable (e.g. from useCallback)
 * @param onPick called with the chosen asset's id, then the dialog closes
 * @param selected_id the currently chosen asset, highlighted in the grid
 * @returns the element
 */
export const AssetPickerDialog = ({open, onClose, onPick, selected_id}: AssetPickerDialogProps) => {
    const dialog_ref = useRef<HTMLDialogElement>(null);

    // sync open state, guarded so a re-render while open doesn't re-open the dialog
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

        dialog.addEventListener("close", onClose);
        return () => dialog.removeEventListener("close", onClose);
    }, [open, onClose]);

    const pick = (asset_id: string) => {
        onPick(asset_id);
        onClose();
    };

    return (
        <dialog ref={dialog_ref} className="modal">
            <div className="modal-box w-3xl max-w-3xl h-[80vh] overflow-y-auto">
                {/* only mounted while open, so the search resets each time */}
                {open && (
                    <AssetBrowser
                        heading={<h3 className="text-lg font-bold">Choose an image</h3>}
                        toolbar_end={
                            <form method="dialog">
                                <button className="btn btn-ghost btn-sm btn-square" title="Close dialog">
                                    <X className="w-5 h-5" />
                                </button>
                            </form>
                        }
                        onPick={pick}
                        selected_id={selected_id}
                    />
                )}
            </div>
        </dialog>
    );
}
