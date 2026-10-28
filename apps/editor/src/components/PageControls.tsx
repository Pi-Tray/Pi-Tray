import {create_page, rename_page, usePageManifest} from "../util/pages.ts";
import {useCallback, useEffect, useState} from "react";
import {ChevronDown, ChevronRight, Plus} from "lucide-react";

export const PageControls = ({selected, show_page}: {selected: string, show_page: (id: string) => void}) => {
    const manifest = usePageManifest();
    const saved_name = manifest.names[selected] ?? "";

    const [local_name, setLocalName] = useState(saved_name);

    // follows switching page, and renames from elsewhere
    useEffect(() => {
        setLocalName(saved_name);
    }, [saved_name]);

    const save_name = useCallback(() => {
        if (local_name.trim() && local_name !== saved_name) {
            rename_page(selected, local_name);
        } else {
            // an empty name would become "Untitled", put the real one back instead
            setLocalName(saved_name);
        }
    }, [local_name, saved_name, selected]);

    const on_name_key = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.currentTarget.blur();
            } else if (e.key === "Escape") {
                setLocalName(saved_name);

                // blurring right after the reset would save the old value, which is a no-op
                requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
            }
        },
        [saved_name]
    );

    const on_page_click = useCallback((id: string) => {
        show_page(id);

        if (document.activeElement) {
            (document.activeElement as HTMLElement).blur();
        }
    }, [show_page]);

    return (
        <div className="flex items-center gap-2">
            <label className="inline-grid min-w-0 max-w-full">
                {/* invisible copy of the name, which sizes the cell the input fills. same classes, so the same width */}
                <span
                    aria-hidden="true"
                    className="input input-ghost text-2xl font-bold invisible whitespace-pre [grid-area:1/1] w-auto"
                >
                    {local_name || " "}
                </span>

                <input
                    size={1}
                    className="input input-ghost text-2xl font-bold [grid-area:1/1] w-full min-w-0"
                    aria-label="Page name"
                    value={local_name}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={save_name}
                    onKeyDown={on_name_key}
                />
            </label>

            <div className="dropdown">
                <button tabIndex={0} role="button" className="btn btn-ghost p-0" title="Change page"><ChevronDown /></button>
                <ul tabIndex={-1} className="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm">
                    {manifest.order.map(id => (
                        <li key={id}>
                            <a onClick={() => on_page_click(id)} className={id === selected ? "font-bold" : ""}>
                                {id === selected && <ChevronRight className="w-4"/>}
                                {manifest.names[id]}{id === manifest.home ? " (home)" : ""}
                            </a>
                        </li>
                    ))}

                    <div className="divider m-0" />

                    <li>
                        <a onClick={() => create_page().then(on_page_click)}><Plus /> Create a new page...</a>
                    </li>
                </ul>
            </div>
        </div>
    );
}

// TODO: search
// TODO: delete
// TODO: reorder
// TODO: assign home
