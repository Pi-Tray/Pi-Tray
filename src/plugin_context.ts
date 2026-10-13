import {AsyncLocalStorage} from "async_hooks";

// which plugin a piece of code is running on behalf of. carried through everything a plugin starts
// (timers, promises, event listeners), so an error thrown from any of them later can be traced back to it
export type PluginRunContext =
    | {kind: "tile", key: string, tile: unknown}
    | {kind: "push", plugin_name: string, x: number, y: number};

export const plugin_context = new AsyncLocalStorage<PluginRunContext>();

type TileErrorHandler = (context: Extract<PluginRunContext, {kind: "tile"}>, error: unknown) => void;

let tile_error_handler: TileErrorHandler | null = null;

/**
 * Lets the live runner decide what happens when one of its tiles throws, e.g. restarting it with backoff.
 * @param handler called with the tile's context and the error
 */
export const set_tile_error_handler = (handler: TileErrorHandler) => {
    tile_error_handler = handler;
}

/**
 * Routes an error nothing caught to the plugin that caused it, so one plugin can't take the server down.<br>
 * Errors that didn't come from a plugin are real server bugs, so those still exit as node would by default.
 */
const handle_uncaught = (error: unknown, kind: string) => {
    const context = plugin_context.getStore();

    if (!context) {
        console.error(`Uncaught ${kind}, exiting:`, error);
        process.exit(1);
    }

    if (context.kind === "tile") {
        if (tile_error_handler) {
            tile_error_handler(context, error);
        } else {
            console.error(`Uncaught ${kind} from live tile ${context.key}:`, error);
        }
        return;
    }

    // usually from something the push handler started without awaiting, so the push itself may already have been acked
    console.error(`Uncaught ${kind} from plugin ${context.plugin_name} (pushed at ${context.x},${context.y}):`, error);
}

process.on("uncaughtException", error => handle_uncaught(error, "exception"));
process.on("unhandledRejection", reason => handle_uncaught(reason, "promise rejection"));