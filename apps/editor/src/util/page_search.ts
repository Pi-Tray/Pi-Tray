import uFuzzy from "@leeoniya/ufuzzy";
import type {PageManifest} from "@pi-tray/types";

// one typo per word
const fuzzy = new uFuzzy({intraMode: 1});

/**
 * Finds pages by name, best match first. Forgives one typo per word.
 * @param manifest the pages to search
 * @param query what was typed, all pages in their usual order if it's blank
 * @returns the matching page ids
 */
export const search_pages = (manifest: PageManifest, query: string): string[] => {
    if (!query.trim()) {
        return manifest.order;
    }

    const names = manifest.order.map((id) => manifest.names[id]);
    const [indexes, info, order] = fuzzy.search(names, query);

    // order ranks info, whose idx lines up with names. without them, indexes is already the matches in page order
    const ranked = info && order ? order.map((rank) => info.idx[rank]) : indexes ?? [];
    return ranked.map((index) => manifest.order[index]);
}
