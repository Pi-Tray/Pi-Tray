import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {openUrl} from "@tauri-apps/plugin-opener";

// links, emphasis and inline code only, anything else is reduced to its plain text
const ALLOWED_ELEMENTS = ["p", "a", "strong", "em", "code"];

/**
 * Checks a link is an ordinary web link, rejecting javascript:, file:, data: and anything unparseable.
 */
const is_web_url = (href: string | undefined): href is string => {
    if (!href) {
        return false;
    }

    try {
        const parsed_url = new URL(href);
        return parsed_url.protocol === "http:" || parsed_url.protocol === "https:";
    } catch {
        return false;
    }
}

/**
 * Renders a plugin-provided description with a safe markdown subset: links, bold, italic and inline code.<br>
 * Raw HTML is ignored, and links open in the system browser rather than navigating the editor.
 * @param children the markdown description text
 * @returns the element
 */
export const PluginDescription = ({children}: {children: string}) => {
    return (
        <Markdown
            remarkPlugins={[remarkGfm]}
            allowedElements={ALLOWED_ELEMENTS}
            unwrapDisallowed
            skipHtml
            components={{
                p: ({children: paragraph_content}) => <p className="text-sm opacity-70">{paragraph_content}</p>,
                code: ({children: code_content}) => <code className="rounded bg-base-300 px-1 text-xs">{code_content}</code>,
                a: ({href, children: link_content}) => {
                    if (!is_web_url(href)) {
                        // not a safe link, show the text without making it clickable
                        return <>{link_content}</>;
                    }

                    return (
                        <a
                            href={href}
                            className="link link-primary"
                            onClick={event => {
                                event.preventDefault();
                                openUrl(href);
                            }}
                        >
                            {link_content}
                        </a>
                    );
                }
            }}
        >
            {children}
        </Markdown>
    );
}
