import type {MessageHandler} from "../types";

import {get_loaded_grid} from "../data";
import {build_cell_payload} from "../cell_payload";

export default ((ws, payload) => {
    const grid = get_loaded_grid();

    // iterate over the grid and send each button
    // TODO: bundle all buttons into one message
    for (const [row_key, row] of Object.entries(grid)) {
        for (const [col_key, cell] of Object.entries(row)) {
            if (cell) {
                ws.send(JSON.stringify({
                    action: "set_cell",
                    payload: build_cell_payload(Number(col_key), Number(row_key), cell)
                }));
            }
        }
    }

    return;
}) as MessageHandler;
