import {
    create_page,
    delete_page,
    duplicate_page,
    move_page,
    rename_page,
    set_home_page,
    usePageManifest
} from "../util/pages.ts";
import {search_pages} from "../util/page_search.ts";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {ArrowDown, ArrowUp, Check, ChevronDown, Copy, Ellipsis, House, Plus, Search, Trash} from "lucide-react";
import {show_confirm} from "../util/dialogs.ts";

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

    const [query, setQuery] = useState("");

    const results = useMemo(() => search_pages(manifest, query), [manifest, query]);

    const [highlighted, setHighlighted] = useState(-1);

    // with a search typed, the best match is highlighted, as it's what Enter picks
    useEffect(() => {
        setHighlighted(query.trim() ? 0 : -1);
    }, [query]);

    // keeps the highlighted page in view while arrowing through a long list
    const highlighted_ref = useRef<HTMLAnchorElement>(null);
    useEffect(() => {
        highlighted_ref.current?.scrollIntoView({block: "nearest"});
    }, [highlighted]);

    const close_dropdown = useCallback(() => {
        setQuery("");
        (document.activeElement as HTMLElement | null)?.blur();
    }, []);

    const on_page_click = useCallback((id: string) => {
        show_page(id);
        close_dropdown();
    }, [show_page, close_dropdown]);

    // named after the search when nothing matched it, as that's probably the page they were looking for
    const create_from_search = useCallback(() => {
        create_page(query.trim() || undefined).then(on_page_click);
    }, [query, on_page_click]);

    const on_search_key = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setHighlighted((index) => Math.min(index + 1, results.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setHighlighted((index) => Math.max(index - 1, -1));
                break;
            case "Enter":
                e.preventDefault();
                if (results[highlighted]) {
                    on_page_click(results[highlighted]);
                } else if (query.trim()) {
                    create_from_search();
                }
                break;
            case "Escape":
                close_dropdown();
                break;
        }
    }, [results, highlighted, query, on_page_click, create_from_search, close_dropdown]);

    const search_ref = useRef<HTMLInputElement>(null);

    // focus the search when the dropdown opens, so they can start typing right away
    const on_dropdown_open = useCallback(() => {
        requestAnimationFrame(() => search_ref.current?.focus());
    }, []);

    return (
        <div className="flex items-center gap-1">
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
                <div tabIndex={0} role="button" className="btn btn-ghost p-0" title="Change page" onFocus={on_dropdown_open}><ChevronDown /></div>
                <ul tabIndex={-1} className="dropdown-content menu bg-base-200 rounded-box z-1 w-52 p-2 shadow-sm max-h-96 flex-nowrap overflow-y-auto">
                    <div className="mb-4 relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 z-2" />
                        <input
                            ref={search_ref}
                            className="input input-ghost input-sm w-full pl-8"
                            placeholder="Search pages..."
                            aria-label="Search pages"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={on_search_key}
                        />
                    </div>

                    {results.map((id, index) => (
                        <li key={id}>
                            <a
                                ref={index === highlighted ? highlighted_ref : undefined}
                                onClick={() => on_page_click(id)}
                                className={`${index === highlighted ? "menu-active" : ""} ${id === selected ? "font-bold" : ""} cursor-pointer flex items-center justify-between gap-2`}
                            >
                                <div className="flex items-center gap-2 truncate">
                                    {id === manifest.home && <House className="w-4" />}
                                    {manifest.names[id]}
                                </div>

                                {id === selected && <Check className="w-4 opacity-75" />}
                            </a>
                        </li>
                    ))}

                    {results.length === 0 && (
                        <li className="menu-disabled"><span>No pages match</span></li>
                    )}

                    <div className="divider m-0" />

                    <li>
                        <a onClick={create_from_search} className={`cursor-pointer ${query.trim() && results.length === 0 ? "menu-active" : ""}`}>
                            <Plus /> {query.trim() && results.length === 0 ? `Create "${query.trim()}"` : "Create a new page..."}
                        </a>
                    </li>
                </ul>
            </div>

            <PageMoreControls
                selected={selected}
                saved_name={saved_name}
                on_page_click={on_page_click}
                close_dropdown={close_dropdown}
                on_deleted={() => setLocalName("")}
            />
        </div>
    );
}

const PageMoreControls = ({
    selected,
    saved_name,
    on_page_click,
    close_dropdown,
    on_deleted
}: {
    selected: string,
    saved_name: string,
    on_page_click: (id: string) => void,
    close_dropdown: () => void
    on_deleted: () => void
}) => {
    const manifest = usePageManifest();

    const is_home = selected === manifest.home;
    const position = manifest.order.indexOf(selected);

    const on_delete = useCallback(() => {
        show_confirm({
            title: "Delete page?",
            message: `Are you sure you want to delete "${saved_name}"? This cannot be undone.`,
            confirm_label: "Delete",
            cancel_label: "Cancel",
            tone: "danger"
        }).then((confirmed) => {
            if (confirmed) {
                delete_page(selected);
                close_dropdown();

                on_deleted();
            }
        });
    }, [saved_name, selected]);

    return (
        <div className="dropdown">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-square" title="Page options"><Ellipsis /></div>
            <ul tabIndex={-1} className="dropdown-content menu bg-base-200 rounded-box z-1 w-56 p-2 shadow-sm">
                <li className={is_home ? "menu-disabled" : ""}>
                    <a onClick={() => { set_home_page(selected); close_dropdown(); }}>
                        <House className="w-4" /> {is_home ? "This is the home page" : "Set as home"}
                    </a>
                </li>
                <li>
                    <a onClick={() => duplicate_page(selected).then(on_page_click)}>
                        <Copy className="w-4" /> Duplicate
                    </a>
                </li>
                {/*<li className={position === 0 ? "menu-disabled" : ""}>*/}
                {/*    <a onClick={() => move_page(selected, position - 1)}><ArrowUp className="w-4" /> Move earlier</a>*/}
                {/*</li>*/}
                {/*<li className={position === manifest.order.length - 1 ? "menu-disabled" : ""}>*/}
                {/*    <a onClick={() => move_page(selected, position + 1)}><ArrowDown className="w-4" /> Move later</a>*/}
                {/*</li>*/}

                <div className="divider m-0" />

                <li className={is_home ? "menu-disabled" : ""}>
                    <a className={is_home ? "" : "text-error"} onClick={() => { close_dropdown(); on_delete(); }}>
                        <Trash className="w-4" /> Delete page
                    </a>
                    {is_home && <span className="text-xs opacity-60 pointer-events-none">Make another page home first</span>}
                </li>
            </ul>
        </div>
    );
}

// TODO: if reorder matters then re-enable, if not remove and add sorting (date, alpha, uses, etc)
// TODO: per device home assignment
// TODO: is it worth adding morecontrols to search results for quicker delete/dupe?
// TODO: assigning links between pages in sidebar (use select for action type ig?)
