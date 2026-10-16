import {PushButton} from "../PushButton";

import {CSSProperties, useCallback, useEffect, useRef, useState} from "react";

import styles from "./component.module.css";
import {useChannel, useChannelMessage, useChannelReady} from "../../contexts/WSContext.tsx";
import {ServerMessage} from "@pi-tray/types";

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

    const channel = useChannel();

    const request_all = useCallback(
        () => {
            if (request_all_buttons && channel?.status === "ready") {
                console.log("Requesting all buttons from server");
                channel.send({action: "all_buttons"});
            }
        },
        [channel, request_all_buttons]
    );

    // request when the channel becomes ready, and again if the grid size changes
    useChannelReady(request_all);
    useEffect(() => {
        request_all();
    }, [rows, cols, request_all]);

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
    const [rows, setRows] = useState<number | null>(null);
    const [cols, setCols] = useState<number | null>(null);

    const channel = useChannel();

    // load grid size from server
    const handle_message = useCallback(
        (data: ServerMessage) => {
            if (data.action === "size") {
                console.log("Received grid size:", data.payload);

                setRows(data.payload.rows);
                setCols(data.payload.cols);
            }
        },
        []
    );
    useChannelMessage(handle_message);

    // when the channel becomes ready, request the grid size
    const request_size = useCallback(
        () => {
            console.log("Requesting grid size from server");
            channel?.send({action: "size"});
        },
        [channel]
    );
    useChannelReady(request_size);

    if (!channel || channel.status === "pairing") {
        return null;
    }

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
