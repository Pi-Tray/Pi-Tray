import {useCallback, useEffect, useRef, useState} from "react";

import {PushButtonGridLayout} from "@pi-tray/ui/PushButtonGridLayout";
import {ButtonResult} from "@pi-tray/ui/PushButtonFace";
import {CellPayload, ServerMessage} from "@pi-tray/types";

import {PushButton} from "../PushButton";
import {useChannel, useChannelMessage, useChannelReady} from "../../contexts/WSContext.tsx";

// how long a push's outline shows for
const RESULT_SHOWN_MS = 1000;

const cell_key = (x: number, y: number) => `${x},${y}`;

interface BasePushButtonGridProps {
    className?: string;
    button_className?: string;
    request_all_buttons?: boolean;
}

interface PushButtonGridProps extends BasePushButtonGridProps {
    rows: number;
    cols: number;
}

/**
 * A grid of buttons showing the cells the server sends, which push them on the server when pressed.
 * @param request_all_buttons whether to ask the server for every cell once ready, and again if the size changes
 * @returns the element
 */
export const PushButtonGrid = ({rows, cols, className, button_className, request_all_buttons}: PushButtonGridProps) => {
    const channel = useChannel();

    const [cells, setCells] = useState<ReadonlyMap<string, CellPayload>>(new Map());
    const [results, setResults] = useState<ReadonlyMap<string, ButtonResult>>(new Map());
    const result_timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    const show_result = useCallback((x: number, y: number, result: NonNullable<ButtonResult>) => {
        const key = cell_key(x, y);

        setResults((previous) => new Map(previous).set(key, result));

        clearTimeout(result_timers.current.get(key));
        result_timers.current.set(key, setTimeout(() => {
            result_timers.current.delete(key);
            setResults((previous) => {
                const next = new Map(previous);
                next.delete(key);
                return next;
            });
        }, RESULT_SHOWN_MS));
    }, []);

    useEffect(() => {
        const timers = result_timers.current;
        return () => timers.forEach((timer) => clearTimeout(timer));
    }, []);

    const handle_message = useCallback(
        (message: ServerMessage) => {
            switch (message.action) {
                case "set_cells":
                    // may only hold the cells that changed, so the rest keep their last value
                    setCells((previous) => {
                        const next = new Map(previous);
                        for (const cell of message.payload) {
                            next.set(cell_key(cell.x, cell.y), cell);
                        }
                        return next;
                    });
                    break;
                case "push_ok":
                    show_result(message.payload.x, message.payload.y, "success");
                    break;
                case "push_error":
                    console.error(`The server reported an error pushing ${message.payload.x},${message.payload.y}`);
                    show_result(message.payload.x, message.payload.y, "failure");
                    break;
            }
        },
        [show_result]
    );
    useChannelMessage(handle_message);

    const push = useCallback(
        (x: number, y: number) => {
            if (channel?.status === "ready") {
                channel.send({action: "push", payload: {x, y}});
            } else {
                console.error(`Can't push ${x},${y}, the channel isn't ready`);
            }
        },
        [channel]
    );

    const request_all = useCallback(
        () => {
            if (request_all_buttons && channel?.status === "ready") {
                channel.send({action: "all_buttons"});
            }
        },
        [channel, request_all_buttons]
    );

    useChannelReady(request_all);
    useEffect(() => {
        request_all();
    }, [rows, cols, request_all]);

    return (
        <PushButtonGridLayout
            rows={rows}
            cols={cols}
            className={className}
            render_cell={(x, y, cell_className) => (
                <PushButton
                    x={x}
                    y={y}
                    cell={cells.get(cell_key(x, y))}
                    result={results.get(cell_key(x, y)) ?? null}
                    on_push={push}
                    className={`${cell_className} ${button_className ?? ""}`}
                />
            )}
        />
    );
}

/**
 * A {@link PushButtonGrid} the size the server says, asking it for every cell once it knows.
 * @returns the element
 */
export const WSPushButtonGrid = ({className, button_className}: BasePushButtonGridProps) => {
    const [size, setSize] = useState<{rows: number, cols: number} | null>(null);

    const channel = useChannel();

    const handle_message = useCallback(
        (message: ServerMessage) => {
            if (message.action === "size") {
                setSize(message.payload);
            }
        },
        []
    );
    useChannelMessage(handle_message);

    const request_size = useCallback(() => channel?.send({action: "size"}), [channel]);
    useChannelReady(request_size);

    if (!channel || channel.status === "pairing") {
        return null;
    }

    if (!size) {
        return <div className={className}>Loading...</div>;
    }

    return (
        <PushButtonGrid
            rows={size.rows}
            cols={size.cols}
            className={className}
            button_className={button_className}
            request_all_buttons={true}
        />
    );
}
