import {useCallback, useEffect, useRef, useState} from "react";

import {PushButtonGridLayout} from "@pi-tray/ui/PushButtonGridLayout";
import {PushButtonResult, PushButtonState} from "@pi-tray/ui/PushButtonFace";
import {CellPayload, ServerMessage} from "@pi-tray/types";

import {PushButton} from "../PushButton";
import {useChannel, useChannelMessage, useChannelReady} from "../../contexts/WSContext.tsx";

// how long a push's outline shows for
const RESULT_SHOWN_MS = 1000;

// how long the button shows as pending before timing out
const PUSH_PENDING_MS = 10000;

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
    const [states, setStates] = useState<ReadonlyMap<string, PushButtonState>>(new Map());
    const result_timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    // pushes still waiting for a reply, per cell, so the first reply to two quick presses doesn't end the second's pending
    const pending_ref_counts = useRef(new Map<string, number>());

    const clear_state = useCallback((key: string) => {
        setStates((previous) => {
            const next = new Map(previous);
            next.delete(key);
            return next;
        });
    }, []);

    const show_result = useCallback((x: number, y: number, result: PushButtonResult) => {
        const key = cell_key(x, y);

        // decrement ref counter for cell
        const ref_count = pending_ref_counts.current.get(key) ?? 0;
        if (ref_count > 1) {
            pending_ref_counts.current.set(key, ref_count - 1);
        } else {
            pending_ref_counts.current.delete(key);
        }

        // if ref count is still > 0, don't show the result yet
        if ((pending_ref_counts.current.get(key) ?? 0) > 0) {
            return;
        }

        setStates((previous) => new Map(previous).set(key, result));

        clearTimeout(result_timers.current.get(key));
        result_timers.current.set(key, setTimeout(() => {
            result_timers.current.delete(key);
            clear_state(key);
        }, RESULT_SHOWN_MS));
    }, [clear_state]);

    const show_pending = useCallback((x: number, y: number) => {
        const key = cell_key(x, y);

        setStates((previous) => new Map(previous).set(key, "pending"));

        // increment ref counter for cell
        const ref_count = pending_ref_counts.current.get(key) ?? 0;
        pending_ref_counts.current.set(key, ref_count + 1);

        clearTimeout(result_timers.current.get(key));
        result_timers.current.set(key, setTimeout(() => {
            result_timers.current.delete(key);

            // the replies are given up on too, so a lost one can't leave the count stuck above zero
            pending_ref_counts.current.delete(key);
            clear_state(key);
        }, PUSH_PENDING_MS));
    }, [clear_state]);

    useEffect(() => {
        const timers = result_timers.current;
        return () => timers.forEach((timer) => clearTimeout(timer));
    }, []);

    // pushes sent before a reconnect never get a reply
    useEffect(() => {
        if (channel?.status === "ready") {
            return;
        }

        pending_ref_counts.current.clear();
        result_timers.current.forEach((timer) => clearTimeout(timer));
        result_timers.current.clear();
        setStates(new Map());
    }, [channel?.status]);

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
                show_pending(x, y);
            } else {
                console.error(`Can't push ${x},${y}, the channel isn't ready`);
            }
        },
        [channel, show_pending]
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
                    state={states.get(cell_key(x, y)) ?? null}
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
