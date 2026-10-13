import type {MessageHandler} from "../types";

export default ((ws, payload) => {
    ws.send(JSON.stringify({
        action: "pong",
    }));
}) as MessageHandler;
