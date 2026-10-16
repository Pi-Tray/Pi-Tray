import type {MessageHandler} from "../types";

export default ((client, payload) => {
    client.send({
        action: "pong",
    });
}) as MessageHandler;
