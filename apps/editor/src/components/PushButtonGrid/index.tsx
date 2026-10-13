import {PushButton} from "../PushButton";

import {CSSProperties, useEffect, useRef, useState} from "react";

import styles from "./component.module.css";

// adapted from client PushButtonGrid code, but ws behaviour ripped out and adapted to a callback function
// also, this code assumes each button instance is responsible for its own representation with the useGridCell hook
// TODO: would be good to have some unified component package rather than duplicating this code by hand and changing it

interface PushButtonGridProps {
    rows: number;
    cols: number;

    on_click?: (x: number, y: number) => void;
    highlight?: {x: number, y: number} | null;

    className?: string;
    button_className?: string;
}

/**
 * Component that renders a grid of {@link PushButton} instances to a specified size.
 * @param rows number of rows in the grid
 * @param cols number of columns in the grid
 * @param className additional class names to apply
 * @param button_className additional class names to apply to each button
 * @param on_click callback function to call when a button is clicked, receives x and y coordinates
 * @param highlight optional coordinates of a button to highlight, if null no button should be highlighted
 * @returns the element
 */
export const PushButtonGrid = ({ rows, cols, className, button_className, on_click, highlight }: PushButtonGridProps) => {
    const gridWrapperRef = useRef<HTMLDivElement>(null);
    const [gridStyle, setGridStyle] = useState<CSSProperties>({});

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
            const highlighted = highlight && highlight.x === x && highlight.y === y;
            const highlight_class = highlighted ? styles.highlight : "";

            button_grid.push(
                <PushButton key={`${x},${y}`} x={x} y={y} className={`${styles.button} ${button_className || ""} ${highlight_class}`} on_click={on_click} />
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
