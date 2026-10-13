import {useEffect, useMemo, useRef, useState} from "react";

import {DynamicIcon, iconNames} from "lucide-react/dynamic";
import {Search, X} from "lucide-react";
import {CUSTOM_ICONS} from "../custom_icons.ts";

// how many matches to render at once, every lucide icon is its own lazily loaded chunk so rendering all ~1600 is slow
const BATCH_SIZE = 120;

type IconTags = Record<string, string[]>;

// tags are ~270kB, so only load them once the picker is first opened
let tags_promise: Promise<IconTags> | null = null;
const load_icon_tags = () => {
    if (!tags_promise) {
        tags_promise = import("lucide-static/tags.json").then(tags_module => tags_module.default as IconTags);
    }

    return tags_promise;
}

/**
 * Scores how well an icon matches the search, or returns null if it doesn't match.<br>
 * Name matches rank above tag matches so that searching "play" puts play before things merely tagged with it.
 */
const score_icon = (name: string, tags: string[], query_terms: string[]): number | null => {
    let total_score = 0;

    for (const term of query_terms) {
        if (name === term) {
            total_score += 4;
        } else if (name.startsWith(term)) {
            total_score += 3;
        } else if (name.includes(term)) {
            total_score += 2;
        } else if (tags.some(tag => tag.includes(term))) {
            total_score += 1;
        } else {
            // every term has to match somewhere
            return null;
        }
    }

    return total_score;
}

interface IconPickerDialogProps {
    open: boolean;
    onClose: () => void;
    onPick: (icon_name: string) => void;
    current?: string;
}

/**
 - A searchable picker for lucide icons and Pi-Tray's custom icons.

 -
 @param open whether the dialog is shown
  -
 @param onClose called when the dialog closes without a pick
  -
 @param onPick called with the chosen icon's name, then the dialog closes
  -
 @param current the currently selected icon name, highlighted in the results
  -
 @returns the element
 */
export const IconPickerDialog = ({open, onClose, onPick, current}: IconPickerDialogProps) => {
    const dialog_ref = useRef<HTMLDialogElement>(null);
    const search_ref = useRef<HTMLInputElement>(null);
    const scroll_container_ref = useRef<HTMLDivElement>(null);

    const [query, setQuery] = useState("");
    const [tags, setTags] = useState<IconTags>({});
    const [visible_count, setVisibleCount] = useState(BATCH_SIZE);

    useEffect(() => {
        if (open) {
            load_icon_tags().then(setTags).catch(error => console.error("Failed to load icon tags:", error));
        }
    }, [open]);

    // reset visible count and scroll position whenever query changes
    useEffect(() => {
        setVisibleCount(BATCH_SIZE);
        if (scroll_container_ref.current) {
            scroll_container_ref.current.scrollTop = 0;
        }
    }, [query]);

    // sync open state, clearing the search each time it opens
    useEffect(() => {
        const dialog = dialog_ref.current;
        if (!dialog) {
            return;
        }

        // guarded so a re-render while open doesn't reset the search or re-open the dialog
        if (open && !dialog.open) {
            setQuery("");
            setVisibleCount(BATCH_SIZE);
            dialog.showModal();
            search_ref.current?.focus();
            if (scroll_container_ref.current) {
                scroll_container_ref.current.scrollTop = 0;
            }
        } else if (!open && dialog.open) {
            dialog.close();
        }

        dialog.addEventListener("close", onClose);
        return () => dialog.removeEventListener("close", onClose);
    }, [open, onClose]);

    const results = useMemo(() => {
        const query_terms = query.toLowerCase().split(/\s+/).filter(Boolean);

        const custom_matches = CUSTOM_ICONS
            .map(icon => ({name: icon.name, custom: icon, score: query_terms.length === 0 ? 0 : score_icon(icon.name, icon.tags, query_terms)}))
            .filter(result => result.score !== null);

        // iconNames also contains ~200 deprecated aliases (e.g. alarm-check for alarm-clock-check), which have no tags
        // hide them once tags have loaded so each icon only shows once
        const tags_loaded = Object.keys(tags).length > 0;

        const lucide_matches = iconNames
            .filter(name => !tags_loaded || name in tags)
            .map(name => ({name: name as string, custom: null, score: query_terms.length === 0 ? 0 : score_icon(name, tags[name] || [], query_terms)}))
            .filter(result => result.score !== null);

        // custom icons always come first, then best scores, then alphabetical
        lucide_matches.sort((first, second) => (second.score! - first.score!) || first.name.localeCompare(second.name));

        return [...custom_matches, ...lucide_matches];
    }, [query, tags]);

    // handle lazy loading as user scrolls near bottom
    const handle_scroll = () => {
        const container = scroll_container_ref.current;
        if (!container) return;

        const {scrollTop, scrollHeight, clientHeight} = container;
        if (scrollHeight - scrollTop - clientHeight < 200) {
            setVisibleCount(prev => Math.min(prev + BATCH_SIZE, results.length));
        }
    };

    const pick = (icon_name: string) => {
        onPick(icon_name);
        onClose();
    };

    const visible_results = results.slice(0, visible_count);

    return (
        <dialog ref={dialog_ref} className="modal">
            <div className="modal-box w-3xl max-w-3xl h-[80vh] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Choose an icon</h3>

                    <form method="dialog">
                        <button className="cursor-pointer" title="Close dialog">
                            <X />
                        </button>
                    </form>
                </div>

                <label className="input input-bordered w-full">
                    <Search className="w-4 h-4 opacity-60" />
                    <input
                        ref={search_ref}
                        type="search"
                        placeholder="Search icons, e.g. play, volume, mic off"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        onKeyDown={event => {
                            // enter picks the top result
                            if (event.key === "Enter" && results.length > 0) {
                                event.preventDefault();
                                pick(results[0].name);
                            }
                        }}
                    />
                </label>

                <div
                    ref={scroll_container_ref}
                    onScroll={handle_scroll}
                    className="flex-1 overflow-y-auto"
                >
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
                        {visible_results.map(result => (
                            <button
                                key={result.name}
                                type="button"
                                title={result.name}
                                onClick={() => pick(result.name)}
                                className={`btn btn-ghost h-auto flex-col gap-1 py-2 font-normal ${result.name === current ? "btn-active" : ""}`}
                            >
                                {result.custom
                                    ? <img src={result.custom.src} alt={result.name} className="w-6 h-6" draggable={false} />
                                    // @ts-expect-error iconNames only contains valid names, but the mapped type widens to string
                                    : <DynamicIcon name={result.name} className="w-6 h-6" />
                                }
                                <span className="text-[0.65rem] leading-tight opacity-70 break-all line-clamp-2">{result.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <p className="text-xs opacity-60">
                    {visible_results.length < results.length
                        ? `Showing ${visible_results.length} of ${results.length} icons`
                        : `${results.length} icon${results.length === 1 ? "" : "s"}`}
                </p>
            </div>
        </dialog>
    );
}
