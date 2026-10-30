import {useCallback, useMemo, useState} from "react";

import {useGridShape, usePageManifest} from "../util/pages";
import {EditingPageContext} from "../contexts/EditingPageContext.tsx";
import {PushButtonGrid} from "../components/PushButtonGrid";

import {X} from "lucide-react";
import {useLiveOverlayConnection} from "../util/live_overlay.ts";
import {PageControls} from "../components/PageControls.tsx";
import {GridEditorSidebarContent} from "../components/GridEditorSidebarContent.tsx";

let last_edited_page: string | null = null;

export const GridEditorPage = () => {
    const [shape, setGridShape] = useGridShape();

    const manifest = usePageManifest();

    // remembered while the editor is open, so leaving the grid editor and coming back stays on the same page
    const [chosen_page, setChosenPage] = useState(last_edited_page);

    // falls back to home if the chosen page was deleted, e.g. from another window or by hand
    const page_id = chosen_page && manifest.order.includes(chosen_page) ? chosen_page : manifest.home;

    const show_page = useCallback((new_page_id: string) => {
        last_edited_page = new_page_id;
        setChosenPage(new_page_id);

        // the sidebar was for a cell on the old page
        setSelectedButton(null);
    }, []);

    const editing_page = useMemo(() => ({page_id, show_page}), [page_id, show_page]);

    // live tile previews from the server, for the page being edited
    useLiveOverlayConnection(page_id);

    // when a button is selected, the sidebar will be open
    const [selected_button, setSelectedButton] = useState<{x: number, y: number} | null>(null);

    const button_clicked = useCallback(
        (x: number, y: number) => {
            setSelectedButton({x, y});
        },
        []
    );

    const close_sidebar = useCallback(
        () => {
            setSelectedButton(null);
        },
        []
    );


    return (
        <EditingPageContext.Provider value={editing_page}>
            <div className="flex h-full max-h-full w-full max-w-full flex-1">
                <div className={`flex-1 flex flex-col h-full max-h-full max-w-full gap-4 ${selected_button ? "w-25 mr-79" : "w-full mr-0"}`}>
                    <PageControls selected={page_id} show_page={show_page} />

                    <div className="flex-1 min-h-0">
                        <PushButtonGrid rows={shape.rows} cols={shape.cols} on_click={button_clicked} highlight={selected_button} />
                    </div>

                    <label className="flex items-center gap-2 mt-2">
                        Grid size:

                        <input
                            type="number"
                            className="input input-sm input-bordered w-15"
                            value={shape.cols}
                            onChange={e => setGridShape({rows: shape.rows, cols: Math.max(1, Math.min(20, Number(e.target.value)))})}
                            min={1}
                            max={20}
                        />
                        x
                        <input
                            type="number"
                            className="input input-sm input-bordered w-15"
                            value={shape.rows}
                            onChange={e => setGridShape({rows: Math.max(1, Math.min(20, Number(e.target.value))), cols: shape.cols})}
                            min={1}
                            max={20}
                        />

                        ({shape.cols * shape.rows} buttons)
                    </label>
                </div>

                <aside className={`h-full flex flex-col fixed top-0 right-0 w-75 overflow-y-auto bg-base-200 border-l border-l-base-300 p-4 transition-transform ${!selected_button && "translate-x-full"}`}>
                    <div className="flex items-center justify-between sticky top-0 bg-base-200 z-10 mb-2 pb-2">
                        <h3 className="font-semibold">Configure cell</h3>

                        <button title="Close configure cell sidebar" onClick={close_sidebar} className="cursor-pointer">
                            <X />
                        </button>
                    </div>

                    {selected_button && <GridEditorSidebarContent coords={selected_button} />}
                </aside>
            </div>
        </EditingPageContext.Provider>
    );
}

// TODO: bg dimming option
// TODO: text color option
// TODO: text font selection
