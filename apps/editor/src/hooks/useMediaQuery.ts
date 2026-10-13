import { useEffect, useState } from "react";

export const useMediaQuery = (query: string): boolean => {
    const [matches, setMatches] = useState<boolean>(() => {
        return window.matchMedia(query).matches || false;
    });

    useEffect(() => {
        const media = window.matchMedia(query);
        if (media.matches !== matches) {
            setMatches(media.matches);
        }

        // setup listener
        const listener = () => setMatches(media.matches);
        media.addEventListener("change", listener);

        // cleanup listener on unmount
        return (() => {
            media.removeEventListener("change", listener);
        });
    }, [query]);

    return matches;
}
