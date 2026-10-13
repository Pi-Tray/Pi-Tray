import {PushButton} from "../PushButton";

import {CSSProperties, useCallback, useEffect, useRef, useState} from "react";

import styles from "./component.module.css";
import {useWebSocket, useWebSocketReadyStateChange} from "../../contexts/WSContext.tsx";

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
 * Component that renders a grid of {@link PushButton} instances to a specified size.
 * @param rows number of rows in the grid
 * @param cols number of columns in the grid
 * @param className additional class names to apply
 * @param button_className additional class names to apply to each button
 * @param request_all_buttons whether to request all buttons from the server after rendering the grid (default: false)
 * @constructor
 */
export const PushButtonGrid = ({ rows, cols, className, button_className, request_all_buttons }: PushButtonGridProps) => {
    const gridWrapperRef = useRef<HTMLDivElement>(null);
    const [gridStyle, setGridStyle] = useState<CSSProperties>({});

    const ws = useWebSocket();

    // its a bit hacky to do here rather than somewhere else and theres probably a better way, but it works
    // usually just sending all the data as soon as the socket connects is fine, but im worried about race conditions
    // note that this callback is always bound but doesnt trigger unless request_all_buttons is true
    // this avoids any instances of the hook order changing if the prop changes
    const request_all = useCallback(
        (state: WebSocket["readyState"]) => {
            console.log("Requesting all buttons from server...");
            if (request_all_buttons && ws && state === WebSocket.OPEN) {
                console.log("Requesting all buttons from server");
                ws.send(JSON.stringify({ action: "all_buttons"}));
            }
        },
        [ws, request_all_buttons]
    );

    // if size changes, request all buttons again
    // could do it smarter but this works reliably, just a bit wasteful
    // TODO: fix this requesting twice
    // TODO: this is in dire need of a refactor! or we could just tell the server to send all buttons when the grid size changes with a flag
    useEffect(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            request_all(ws.readyState);
        }
    }, [ws, rows, cols, request_all]);

    // bind request to websocket ready state change
    // TODO: this is a race condition
    // TODO: this causes 4 requests to fire at first launch!
    useWebSocketReadyStateChange(request_all);

    // TODO: fix gemini's terrible code
    // i had to do this, grid was pissing me off and this way works
    useEffect(() => {
        const calculateGridSize = () => {
            if (!gridWrapperRef.current) return;

            // Read the 'gap' value directly from the element's computed styles.
            // This converts any CSS unit (rem, vw, etc.) into pixels for the calculation.
            const gap = parseFloat(window.getComputedStyle(gridWrapperRef.current).gap) || 0;

            const containerWidth = gridWrapperRef.current.clientWidth;
            const containerHeight = gridWrapperRef.current.clientHeight;

            const totalGapWidth = (cols - 1) * gap;
            const totalGapHeight = (rows - 1) * gap;

            const buttonWidthFromContainer = (containerWidth - totalGapWidth) / cols;
            const buttonHeightFromContainer = (containerHeight - totalGapHeight) / rows;

            // Use the smaller dimension to maintain a square shape
            const buttonSize = Math.floor(Math.min(buttonWidthFromContainer, buttonHeightFromContainer));

            if (buttonSize > 0) {
                const gridWidth = cols * buttonSize + totalGapWidth;
                const gridHeight = rows * buttonSize + totalGapHeight;

                setGridStyle({
                    display: 'grid',
                    gridTemplateColumns: `repeat(${cols}, ${buttonSize}px)`,
                    gridTemplateRows: `repeat(${rows}, ${buttonSize}px)`,
                    gap: `${gap}px`,
                    width: `${gridWidth}px`,
                    height: `${gridHeight}px`,
                });
            } else {
                // If the container is too small, hide the grid
                setGridStyle({ display: 'none' });
            }
        };

        calculateGridSize(); // Initial calculation

        // Recalculate on resize using a ResizeObserver for performance
        const resizeObserver = new ResizeObserver(calculateGridSize);
        if (gridWrapperRef.current) {
            resizeObserver.observe(gridWrapperRef.current);
        }

        // Cleanup observer
        return () => {
            if (gridWrapperRef.current) {
                resizeObserver.unobserve(gridWrapperRef.current);
            }
        };
    }, [rows, cols]); // Recalculate if rows or cols change

    const button_grid = [];

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            button_grid.push(
                <PushButton key={`${x},${y}`} x={x} y={y} className={`${styles.button} ${button_className || ""}`} />
            );
        }
    }

    return (
        <div ref={gridWrapperRef} className={styles.wrapper}>
            <div style={gridStyle} className={`${styles.grid} ${className || ""}`}>
                {button_grid}
            </div>
        </div>
    );
}

/**
 * Component that renders a grid of {@link PushButton} instances to a size specified by the server.<br>
 * It will also request all button data from the server after rendering the grid.
 * @param fit whether to make buttons on the grid scale equally to fit the width of the container (default: true)
 * @param className additional class names to apply
 * @param button_className additional class names to apply to each button
 * @constructor
 */
export const WSPushButtonGrid = ({ className, button_className }: BasePushButtonGridProps) => {
    const [rows, setRows] = useState(null);
    const [cols, setCols] = useState(null);

    const ws = useWebSocket();

    // load grid size from server
    const handle_message = useCallback(
        (event: MessageEvent) => {
            const data = JSON.parse(event.data);

            if (data.action === "size") {
                console.log("Received grid size:", data.payload);

                setRows(data.payload.rows);
                setCols(data.payload.cols);
            }
        },
        [ws]
    );

    const request_size = useCallback(
        (state: WebSocket["readyState"]) => {
            if (ws && state === WebSocket.OPEN) {
                console.log("Requesting grid size from server");
                ws.send(JSON.stringify({action: "size"}));
            }
        },
        [ws]
    );

    // bind message handling
    useEffect(() => {
        if (ws) {
            ws.addEventListener("message", handle_message);
        }

        return () => {
            if (ws) {
                ws.removeEventListener("message", handle_message);
            }
        };
    }, [ws, handle_message]);

    // when websocket becomes ready, request the grid size
    useWebSocketReadyStateChange(request_size);

    if (rows === null || cols === null) {
        return <div className={className}>Loading...</div>;
    }

    return (
        <PushButtonGrid
            rows={rows}
            cols={cols}

            className={className}
            button_className={button_className}

            request_all_buttons={true}
        />
    );
}
