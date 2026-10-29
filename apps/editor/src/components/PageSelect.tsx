import {Check, House, Plus, Search} from "lucide-react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {search_pages} from "../util/page_search.ts";
import {create_page, usePageManifest} from "../util/pages.ts";

export const PageSelect = ({
    selected,
    on_select,
    on_cancel,
    search_ref,
    show_create = true
}: {
    selected: string;
    on_select: (id: string) => void;
    on_cancel?: () => void;
    search_ref?: React.RefObject<HTMLInputElement | null>;
    show_create?: boolean;
}) => {
    const manifest = usePageManifest();

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

    const on_page_click = useCallback((id: string) => {
        setQuery("");
        on_select(id);
    }, [on_select]);

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
                e.preventDefault();
                on_cancel?.();
                break;
        }
    }, [results, highlighted, query, on_page_click, create_from_search, on_cancel]);

    return (
        <div className="menu z-1 w-full p-2 flex-nowrap overflow-y-auto">
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

            {show_create && (
                <>
                    <div className="divider m-0" />

                    <li>
                        <a onClick={create_from_search} className={`cursor-pointer ${query.trim() && results.length === 0 ? "menu-active" : ""}`}>
                            <Plus /> {query.trim() && results.length === 0 ? `Create "${query.trim()}"` : "Create a new page..."}
                        </a>
                    </li>
                </>
            )}
        </div>
    );
}