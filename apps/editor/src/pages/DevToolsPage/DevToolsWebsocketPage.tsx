import {useState, useCallback, useEffect} from "react";
import {useWebSocket} from "../../contexts/WSProvider";
import {AlertCircle, ArrowLeft} from "lucide-react";
import {Link} from "wouter";

export const DevToolsWebsocketPage = () => {
    const ws = useWebSocket();

    const [replies, setReplies] = useState<string>("");

    const [send_area_value, setSendAreaValue] = useState<string>("");
    const [send_area_class, setSendAreaClass] = useState<string>("");

    const [send_error_visible, setSendErrorVisible] = useState<boolean>(false);

    const send_message = useCallback(
        () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                const message = send_area_value.trim();

                // validate json
                try {
                    JSON.parse(message);
                } catch (e) {
                    setSendAreaClass("textarea-error");

                    // show error message for a few seconds
                    setSendErrorVisible(true);
                    setTimeout(() => setSendErrorVisible(false), 3000);
                    return;
                }

                if (message) {
                    ws.send(message);
                    setSendAreaClass("textarea-success");
                }
            } else {
                console.warn("WebSocket is not open");
            }
        },
        [ws, send_area_value]
    );

    const on_message = useCallback(
        (event: MessageEvent) => {
            const message = event.data;
            setReplies(prev => `${message}\n${prev}`);
        },
        [setReplies]
    );

    // add message listener to the websocket
    useEffect(() => {
        if (ws) {
            ws.addEventListener("message", on_message);

            // cleanup listener on unmount
            return () => {
                ws.removeEventListener("message", on_message);
            };
        }
    }, [ws, on_message]);

    const area_change = useCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            const value = event.target.value;
            setSendAreaValue(value);

            // validate json
            try {
                JSON.parse(value);
                setSendAreaClass("");
            } catch (e) {
                setSendAreaClass("textarea-error");
            }
        },
        [setSendAreaValue, setSendAreaClass]
    );

    const allow_interaction = ws && ws.readyState === WebSocket.OPEN;

    return (
        <div className="h-full w-full flex flex-col">
            <div className="flex items-center gap-2">
                <Link href="/devtools" className="btn btn-ghost btn-sm btn-square" title="Back to DevTools">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <h1 className="text-2xl font-bold">Test WebSocket</h1>
            </div>

            <div className="m-4 flex flex-col gap-4 h-full">
                <fieldset className="fieldset">
                    <legend className="fieldset-legend">Outbound message</legend>

                    <textarea
                        className={`textarea h-24 w-full resize-none ${send_area_class}`}
                        placeholder={allow_interaction ? "JSON message" : "WebSocket not connected."}
                        disabled={!allow_interaction}

                        value={send_area_value}
                        onChange={area_change}
                    ></textarea>

                    <button className="btn btn-primary mt-2" onClick={send_message} disabled={!allow_interaction}>Send</button>
                </fieldset>

                <fieldset className="fieldset h-full flex flex-col">
                    <legend className="fieldset-legend">Recent replies</legend>

                    <textarea
                        className="textarea textarea-neutral h-full w-full resize-none"
                        placeholder={allow_interaction ? "JSON replies will arrive here..." : "WebSocket not connected."}
                        disabled={!allow_interaction}
                        readOnly={true}

                        value={replies}
                    ></textarea>

                    <div className="label">(Newest first)</div>
                </fieldset>
            </div>

            <div role="alert" aria-hidden={!send_error_visible} className={`${send_error_visible ? "" : "opacity-0"} alert alert-error pointer-events-none fixed bottom-5 left-1/2 -translate-x-1/2 w-fit transition-opacity duration-300`}>
                <AlertCircle />
                <span>Refusing to send invalid JSON.</span>
            </div>
        </div>
    );
}
