import {useWebSocket} from "../../contexts/WSContext.tsx";
import {useEffect, useState, useCallback} from "react";

import {AutoTextScale} from "../AutoTextScale";

import {DynamicIcon} from "lucide-react/dynamic";

import styles from "./component.module.css";

/**
 * Resolves an asset path from the server (e.g. `/assets/<id>.png?v=123`) against the server's address.<br>
 * Anything that would load from a different origin is rejected.
 * @param asset_path the path from the server, or null for no image
 * @param socket_url the websocket's url, e.g. ws://192.168.50.1:8080
 * @returns the full http url, or an empty string for no image
 */
const resolve_asset_url = (asset_path: string | null | undefined, socket_url: string): string => {
    if (!asset_path) {
        return "";
    }

    // ws -> http and wss -> https
    const server_base = socket_url.replace(/^ws/, "http");

    try {
        const resolved_url = new URL(asset_path, server_base);
        return resolved_url.origin === new URL(server_base).origin ? resolved_url.href : "";
    } catch {
        return "";
    }
}

interface PushButtonProps {
    x: number;
    y: number;
    style?: React.CSSProperties;
    className?: string;
}

/**
 * The button that sends a push action to the server, as well as handles server responses to update it.
 * @param x x coordinate of the button on the grid, used to identify the button in messages
 * @param y y coordinate of the button on the grid, used to identify the button in messages
 * @param style inline styles to apply to the button
 * @param className additional class names to apply
 * @constructor
 */
export const PushButton = ({x, y, style, className}: PushButtonProps) => {
    const [text, setText] = useState("");
    const [text_is_icon, setTextIsIcon] = useState(false);
    const [background_url, setBackgroundURL] = useState("");

    const [pushable, setPushable] = useState(true);

    const [result_class, setResultClass] = useState("");

    const ws = useWebSocket();

    // log function that includes button coordinates, acts just like console.log
    const button_log = useCallback(
        (...msg: any[]) => {
            console.log(`[PushButton ${x},${y}]:`, ...msg);
        },
        [x, y]
    );

    // no prizes for guessing what this does
    const button_error = useCallback(
        (...msg: any[]) => {
            console.error(`[PushButton ${x},${y}]:`, ...msg);
        },
        [x, y]
    );

    // send push action to the server when the button is clicked
    const handle_click = useCallback(
        () => {
            if (!pushable) {
                return;
            }

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    action: "push",
                    payload: {x, y}
                }));
            } else {
                button_error("WebSocket is not open");
            }
        },
        [ws, x, y, pushable]
    );

    // handle various messages from the server
    const handle_message = useCallback(
        (event: MessageEvent) => {
            const data = JSON.parse(event.data);

            switch (data.action) {
                case "push_ok":
                    if (data.payload.x === x && data.payload.y === y) {
                        button_log("Server acknowledged push.");

                        // mark success for 1 second
                        setResultClass(styles.success);
                        setTimeout(() => {
                            setResultClass("");
                        }, 1000);
                    }
                    break;
                case "push_error":
                    if (data.payload.x === x && data.payload.y === y) {
                        button_error("Server reported an error for push action.");

                        // mark failure for 1 second
                        setResultClass(styles.failure);
                        setTimeout(() => {
                            setResultClass("");
                        }, 1000);
                    }
                    break;
                case "set_cell":
                    if (data.payload.x === x && data.payload.y === y) {
                        button_log("Server set cell:", data.payload.text, "is icon:", data.payload.is_icon, "background:", data.payload.background);
                        setText(data.payload.text);
                        setTextIsIcon(data.payload.is_icon || false);
                        setBackgroundURL(resolve_asset_url(data.payload.background, (event.target as WebSocket).url));
                        setPushable(data.payload.pushable ?? true);
                    }
                    break;
            }
        },
        [x, y, button_log]
    );

    // bind the message handler to the websocket
    useEffect(() => {
        if (ws) {
            ws.addEventListener("message", handle_message);
            return () => {
                ws.removeEventListener("message", handle_message);
            };
        }
    }, [ws]);

    let content: React.ReactNode = null;

    if (text) {
        if (text_is_icon) {
            // if the name is "pi-tray", load our logo specially :)
            if (text === "pi-tray") {
                content = (
                    <img
                        src={`${import.meta.env.BASE_URL}icon.svg`}
                        alt="Pi Tray Logo"
                        className={styles.icon}
                        draggable={false}
                    />
                );
            } else {
                // otherwise, use DynamicIcon to load the lucide icon by name

                content = (
                    <DynamicIcon
                        // @ts-expect-error we have no realistic way to validate the icon name at compile time, so assume it's valid and catch errors at runtime
                        name={text}
                        className={styles.icon}
                        fallback={
                            // fallback to text if the icon is not found
                            () => <AutoTextScale>{text}</AutoTextScale>
                        }
                    ></DynamicIcon>
                );
            }
        } else {
            content = <AutoTextScale>{text}</AutoTextScale>;
        }
    }

    // JSON.stringify quotes and escapes the url, so it can't break out of the css url()
    const button_style: React.CSSProperties = background_url
        ? {...style, backgroundImage: `url(${JSON.stringify(background_url)})`, backgroundSize: "cover", backgroundPosition: "center"}
        : {...style};

    return (
        <button style={button_style} className={`${styles.element} ${result_class} ${className || ""}`} onClick={handle_click} disabled={!pushable}>
            {content}
        </button>
    );
}
