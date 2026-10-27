import {PushButtonGridLayout} from "@pi-tray/ui/PushButtonGridLayout";

import {PushButton} from "../PushButton";

interface PushButtonGridProps {
    rows: number;
    cols: number;

    on_click?: (x: number, y: number) => void;
    highlight?: {x: number, y: number} | null;

    className?: string;
    button_className?: string;
}

/**
 * The page being edited, each button reading its own cell.
 * @param highlight the button to outline, e.g. the one being edited
 * @returns the element
 */
export const PushButtonGrid = ({rows, cols, on_click, highlight, className, button_className}: PushButtonGridProps) => (
    <PushButtonGridLayout
        rows={rows}
        cols={cols}
        className={className}
        render_cell={(x, y, cell_className) => (
            <PushButton
                x={x}
                y={y}
                on_click={on_click}
                highlighted={highlight?.x === x && highlight?.y === y}
                className={`${cell_className} ${button_className ?? ""}`}
            />
        )}
    />
);
