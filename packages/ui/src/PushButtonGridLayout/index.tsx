import {CSSProperties, Fragment, ReactNode, useEffect, useRef, useState} from "react";

import styles from "./component.module.css";

interface PushButtonGridLayoutProps {
    rows: number;
    cols: number;

    /**
     * Renders the button at a position. Give it cell_className so it fills its square.
     */
    render_cell: (x: number, y: number, cell_className: string) => ReactNode;

    className?: string;
}

/**
 * Lays out rows by cols square buttons, as large as fit in the container.
 * @returns the element
 */
export const PushButtonGridLayout = ({rows, cols, render_cell, className}: PushButtonGridLayoutProps) => {
    const wrapper_ref = useRef<HTMLDivElement>(null);
    const [grid_style, setGridStyle] = useState<CSSProperties>({});

    useEffect(() => {
        const wrapper = wrapper_ref.current;
        if (!wrapper) {
            return;
        }

        const fit_to_wrapper = () => {
            // the gap in pixels, whatever unit the css gave it in
            const gap = parseFloat(window.getComputedStyle(wrapper).gap) || 0;

            const total_gap_width = (cols - 1) * gap;
            const total_gap_height = (rows - 1) * gap;

            // square buttons, so the smaller of the two sizes that would fit
            const button_size = Math.floor(Math.min(
                (wrapper.clientWidth - total_gap_width) / cols,
                (wrapper.clientHeight - total_gap_height) / rows
            ));

            if (button_size <= 0) {
                setGridStyle({display: "none"});
                return;
            }

            setGridStyle({
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, ${button_size}px)`,
                gridTemplateRows: `repeat(${rows}, ${button_size}px)`,
                gap: `${gap}px`,
                width: `${cols * button_size + total_gap_width}px`,
                height: `${rows * button_size + total_gap_height}px`
            });
        };

        fit_to_wrapper();

        const resize_observer = new ResizeObserver(fit_to_wrapper);
        resize_observer.observe(wrapper);

        return () => resize_observer.disconnect();
    }, [rows, cols]);

    const cells: ReactNode[] = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            cells.push(<Fragment key={`${x},${y}`}>{render_cell(x, y, styles.cell)}</Fragment>);
        }
    }

    return (
        <div ref={wrapper_ref} className={styles.wrapper}>
            <div style={grid_style} className={`${styles.grid} ${className ?? ""}`}>
                {cells}
            </div>
        </div>
    );
}
