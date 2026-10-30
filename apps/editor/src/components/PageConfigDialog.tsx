import {useEffect, useRef} from "react";

import {X} from "lucide-react";
import {usePageManifest, usePageSettings} from "../util/pages.ts";

interface PageConfigDialogProps {
    open: boolean;
    onClose: () => void;
    page_id: string;
}

export const PageConfigDialog = ({open, onClose, page_id}: PageConfigDialogProps) => {
    const manifest = usePageManifest();

    const dialog_ref = useRef<HTMLDialogElement>(null);

    // sync open state, guarded so a re-render while open doesn't reset the search or re-open the dialog
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

    const [settings, update_setting] = usePageSettings(page_id);

    return (
        <dialog ref={dialog_ref} className="modal">
            <div className="modal-box w-2xl max-w-2xl h-[80vh] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Configure page "{manifest.names[page_id]}"</h3>

                    <form method="dialog">
                        <button className="btn btn-ghost btn-sm btn-square" title="Close dialog">
                            <X className="w-5 h-5" />
                        </button>
                    </form>
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col gap-3 justify-center">
                    <label className="label flex flex-col gap-2">
                        Page title

                        <select className="select" value={settings.title || "none"} onChange={e => update_setting({title: e.target.value as "left" | "center" | "right" | "none"})}>
                            <option value="none">Don't show</option>
                            <option value="left">Left aligned</option>
                            <option value="center">Center aligned</option>
                            <option value="right">Right aligned</option>
                        </select>
                    </label>
                </div>
            </div>
        </dialog>
    );
}
