import type {MessageHandler} from "../types";

import {get_shape} from "../pages";

export default ((client, payload) => {
    client.send({
        action: "size",
        payload: get_shape()
    });
}) as MessageHandler;
