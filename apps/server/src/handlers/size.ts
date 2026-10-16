import type {MessageHandler} from "../types";

import {get_shape_of_loaded_grid} from "../data";

export default ((client, payload) => {
    const shape = get_shape_of_loaded_grid();

    client.send({
        action: "size",
        payload: shape
    });
}) as MessageHandler;
