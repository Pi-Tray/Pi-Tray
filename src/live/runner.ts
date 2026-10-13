import {AsyncLocalStorage} from "async_hooks";

import {Plugin, PluginConfig, PLUGIN_LIVE_CONTROL_FIELDS} from "../types";

import {add_grid_change_listener, get_loaded_grid} from "../data";
import {add_plugin_cache_clear_listener, load_plugin} from "../plugins";
import {clear_live_state, LiveCellState, set_live_state} from "./state";

// the fastest a single tile can send updates to clients, faster updates are merged into the next send
const MIN_UPDATE_INTERVAL_MS = 100;

// how long to wait before restarting a tile whose plugin failed, growing with each failure in a row
const RESTART_DELAYS_MS = [1000, 5000, 30000];

interface RunningTile {
    row_idx: number;
    col_idx: number;
    controller: AbortController;
    cleanup?: () => void;

    // plugin name + config, so a changed cell can be told apart from an unchanged one
    key: string;

    // values waiting to be sent, merged together if the plugin updates faster than the throttle
    pending_state: LiveCellState | null;
    flush_timer: NodeJS.Timeout | null;
    last_flush_at: number;
}

interface DesiredTile {
    row_idx: number;
    col_idx: number;
    plugin: Plugin;
    config: PluginConfig;
    key: string;
}

// keyed by "row,col"
const running_tiles = new Map<string, RunningTile>();

// tiles waiting to restart after a failure, and how many times in a row each has failed
const restart_timers = new Map<string, NodeJS.Timeout>();
const failure_counts = new Map<string, number>();

// tiles only run while someone is watching
let client_count = 0;

// carried through everything a tile's init starts (timers, promises, event listeners), so an error thrown
// from any of them later can be traced back to the tile that caused it
const tile_context = new AsyncLocalStorage<{key: string, tile: RunningTile}>();

// stopped tiles that ignored their signal and keep throwing, each only logged once
const noisy_stopped_tiles = new WeakSet<RunningTile>();

const cell_key = (row_idx: number, col_idx: number) => `${row_idx},${col_idx}`;

/**
 * Works out which cells should have a live tile running, from the grid and the connected clients.
 */
const find_desired_tiles = (): Map<string, DesiredTile> => {
    const desired_tiles = new Map<string, DesiredTile>();

    if (client_count === 0) {
        return desired_tiles;
    }

    for (const [row_key, row] of Object.entries(get_loaded_grid())) {
        for (const [col_key, cell] of Object.entries(row)) {
            if (!cell?.plugin) {
                continue;
            }

            const plugin_name = typeof cell.plugin === "string" ? cell.plugin : cell.plugin.name;
            const config = (typeof cell.plugin === "string" ? undefined : cell.plugin.config) || {};

            let plugin: Plugin;
            try {
                plugin = load_plugin(plugin_name);
            } catch (error) {
                // a plugin that can't load can't run live either, pushes report the error to the user
                continue;
            }

            if (!plugin.live) {
                continue;
            }

            const row_idx = Number(row_key);
            const col_idx = Number(col_key);

            desired_tiles.set(cell_key(row_idx, col_idx), {
                row_idx,
                col_idx,
                plugin,
                config,
                key: JSON.stringify([plugin_name, config])
            });
        }
    }

    return desired_tiles;
}

/**
 * Sends a tile's pending values, at most once per MIN_UPDATE_INTERVAL_MS.
 */
const schedule_flush = (tile: RunningTile) => {
    if (tile.flush_timer) {
        // already scheduled, the pending values will go with it
        return;
    }

    const wait_ms = Math.max(0, tile.last_flush_at + MIN_UPDATE_INTERVAL_MS - Date.now());

    tile.flush_timer = setTimeout(() => {
        tile.flush_timer = null;

        if (tile.controller.signal.aborted || !tile.pending_state) {
            return;
        }

        const state = tile.pending_state;
        tile.pending_state = null;
        tile.last_flush_at = Date.now();

        set_live_state(tile.row_idx, tile.col_idx, state);
    }, wait_ms);
}

/**
 * Stops a tile: aborts its signal, runs its cleanup, and by default clears its live values.
 */
const stop_tile = (key: string, clear_state = true) => {
    const tile = running_tiles.get(key);
    if (!tile) {
        return;
    }

    running_tiles.delete(key);

    if (tile.flush_timer) {
        clearTimeout(tile.flush_timer);
    }

    // each step guarded separately, so one broken plugin can't stop the rest shutting down
    try {
        tile.controller.abort();
    } catch (error) {
        console.error(`Error aborting live tile ${key}:`, error);
    }

    try {
        tile.cleanup?.();
    } catch (error) {
        console.error(`Error cleaning up live tile ${key}:`, error);
    }

    if (clear_state) {
        clear_live_state(tile.row_idx, tile.col_idx);
    }
}

/**
 * Stops a failed tile and schedules a restart, waiting longer each time it fails in a row.
 */
const handle_tile_failure = (key: string, error: unknown) => {
    console.error(`Live tile ${key} failed:`, error);

    stop_tile(key);

    const failure_count = (failure_counts.get(key) ?? 0) + 1;
    failure_counts.set(key, failure_count);

    const delay_ms = RESTART_DELAYS_MS[Math.min(failure_count, RESTART_DELAYS_MS.length) - 1];
    console.log(`Restarting live tile ${key} in ${delay_ms}ms`);

    restart_timers.set(key, setTimeout(() => {
        restart_timers.delete(key);
        reconcile_live_tiles();
    }, delay_ms));
}

const start_tile = (key: string, desired: DesiredTile) => {
    const live = desired.plugin.live!;
    const controller = new AbortController();

    const tile: RunningTile = {
        row_idx: desired.row_idx,
        col_idx: desired.col_idx,
        controller,
        key: desired.key,
        // a plugin controlling the label shows its text as text unless it says otherwise, whatever the stored
        // cell was set to. held back until the plugin's first update, so the stored label shows until then
        pending_state: live.controls.includes("label") ? {text_is_icon: false} : null,
        flush_timer: null,
        last_flush_at: 0
    };

    running_tiles.set(key, tile);

    // the cell fields the plugin's controls cover, e.g. label covers text and text_is_icon.
    // only these are accepted, as plain js plugins aren't checked by the types
    const allowed_fields = new Set<string>(live.controls.flatMap(control => PLUGIN_LIVE_CONTROL_FIELDS[control] ?? []));

    const warned_fields = new Set<string>();

    const update = (state: LiveCellState) => {
        // a stopped tile's leftover timers can't write anything
        if (controller.signal.aborted || !state || typeof state !== "object") {
            return;
        }

        const allowed_state: Record<string, unknown> = {};

        for (const [field, value] of Object.entries(state)) {
            if (allowed_fields.has(field)) {
                allowed_state[field] = value;
            } else if (!warned_fields.has(field)) {
                // once per field per tile, so a plugin updating every second doesn't flood the log
                warned_fields.add(field);
                console.warn(`Live tile ${key} tried to set "${field}", which its controls (${live.controls.join(", ")}) don't cover, so it was ignored`);
            }
        }

        tile.pending_state = {...tile.pending_state, ...allowed_state};
        schedule_flush(tile);
    };

    try {
        const result: unknown = tile_context.run({key, tile}, () => live.init({
            config: desired.config,
            update,
            signal: controller.signal,

            x: desired.col_idx,
            y: desired.row_idx
        }));

        // init may be async, so a cleanup or a failure can arrive later
        if (result instanceof Promise) {
            result.then(
                cleanup => {
                    if (typeof cleanup !== "function") {
                        return;
                    }

                    if (controller.signal.aborted) {
                        // stopped while init was still running, so clean up straight away
                        cleanup();
                    } else {
                        tile.cleanup = cleanup;
                    }
                },
                error => {
                    if (running_tiles.get(key) === tile) {
                        handle_tile_failure(key, error);
                    }
                }
            );
        } else if (typeof result === "function") {
            tile.cleanup = result as () => void;
        }
    } catch (error) {
        handle_tile_failure(key, error);
    }
}

/**
 * Starts, stops and restarts live tiles so that exactly the cells that should be live are.<br>
 * Safe to call as often as needed, tiles that haven't changed keep running untouched.
 */
export const reconcile_live_tiles = () => {
    const desired_tiles = find_desired_tiles();

    // stop tiles whose cell no longer has a live plugin, or whose plugin or config changed
    for (const [key, tile] of running_tiles) {
        const desired = desired_tiles.get(key);

        if (!desired || desired.key !== tile.key) {
            stop_tile(key);
        }
    }

    // forget failures and pending restarts for cells that changed or are no longer live
    for (const key of [...restart_timers.keys(), ...failure_counts.keys()]) {
        if (!desired_tiles.has(key)) {
            clearTimeout(restart_timers.get(key));
            restart_timers.delete(key);
            failure_counts.delete(key);
        }
    }

    for (const [key, desired] of desired_tiles) {
        // waiting out a restart delay, the timer reconciles again when it's up
        if (running_tiles.has(key) || restart_timers.has(key)) {
            continue;
        }

        start_tile(key, desired);
    }
}

/**
 * Call when a client connects. The first client starts the live tiles.
 */
export const live_client_connected = () => {
    client_count++;

    if (client_count === 1) {
        reconcile_live_tiles();
    }
}

/**
 * Call when a client disconnects. The last client leaving stops every live tile.
 */
export const live_client_disconnected = () => {
    client_count = Math.max(0, client_count - 1);

    if (client_count === 0) {
        reconcile_live_tiles();
    }
}

/**
 * Routes an error nothing caught to the live tile that caused it, so one plugin can't take the server down.<br>
 * Errors that didn't come from a live tile are real server bugs, so those still exit as node would by default.
 */
const handle_uncaught = (error: unknown, kind: string) => {
    const store = tile_context.getStore();

    if (!store) {
        console.error(`Uncaught ${kind}, exiting:`, error);
        process.exit(1);
    }

    if (running_tiles.get(store.key) === store.tile) {
        handle_tile_failure(store.key, error);
    } else if (!noisy_stopped_tiles.has(store.tile)) {
        // a stopped tile whose plugin didn't clear its timers. nothing more can be done without isolating plugins
        noisy_stopped_tiles.add(store.tile);
        console.error(`Live tile ${store.key} is still throwing after being stopped, its plugin isn't cleaning up when signal aborts:`, error);
    }
}

process.on("uncaughtException", error => handle_uncaught(error, "exception"));
process.on("unhandledRejection", reason => handle_uncaught(reason, "promise rejection"));

// a changed cell may need its tile started, stopped or restarted
add_grid_change_listener(async () => reconcile_live_tiles());

// stop every tile before the plugins are unloaded, then start them again from the fresh code
add_plugin_cache_clear_listener(() => {
    for (const key of [...running_tiles.keys()]) {
        stop_tile(key);
    }

    // the cache is cleared synchronously after this listener, so reconciling in a microtask uses the new code
    queueMicrotask(reconcile_live_tiles);
});
