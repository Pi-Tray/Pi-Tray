import type {MessageHandler} from "../types";

import {get_shape_of_loaded_grid} from "../data";

export default ((ws, payload) => {
    const shape = get_shape_of_loaded_grid();

    ws.send(JSON.stringify({
        action: "size",
        payload: shape
    }));
}) as MessageHandler;
