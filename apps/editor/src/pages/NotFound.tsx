import {usePathname} from "wouter/use-browser-location";

export const NotFound = () => {
    const location = usePathname();
    const issue_title = encodeURIComponent(`Unrouted link: ${location}`);

    return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-4">
            <p>How did you get here? 😕</p>
            <a className="link link-primary" href={`https://github.com/Pi-Tray/editor/issues/new?title=${issue_title}`} target="_blank" rel="noreferrer noopener">Open an issue</a>
        </div>
    );
}
