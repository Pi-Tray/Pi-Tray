import type {PluginConfig, PluginReference} from "./index.js";
import {PLUGIN_LIVE_CONTROLLABLE} from "./index.js";

/**
 * A plugin reference with both forms (just a name, or a name and config) turned into one shape.
 * @param plugin_ref the reference, as stored on a cell
 * @returns the plugin's name and its config, which is empty if none was given
 */
export const unwrap_plugin_reference = (plugin_ref: PluginReference): {name: string, config: PluginConfig} => {
    if (typeof plugin_ref === "string") {
        return {name: plugin_ref, config: {}};
    }

    return {name: plugin_ref.name, config: plugin_ref.config || {}};
}

/**
 * Checks a module's default export looks like a plugin.<br>
 * Used by the server before running a plugin, and by editors to warn about broken ones.
 * @param plugin the default export
 * @returns every problem found, empty if it's valid
 */
export const find_plugin_problems = (plugin: any): string[] => {
    const problems: string[] = [];

    if (!plugin || typeof plugin !== "object") {
        return ["the default export isn't an object"];
    }

    if (plugin.dispose !== undefined && typeof plugin.dispose !== "function") {
        problems.push("dispose must be a function");
    }

    if (plugin.handle_push !== undefined && typeof plugin.handle_push !== "function") {
        problems.push("handle_push must be a function");
    }

    if (plugin.live !== undefined) {
        const live = plugin.live;

        if (!live || typeof live !== "object") {
            problems.push("live must be an object");
        } else {
            if (typeof live.init !== "function") {
                problems.push("live.init must be a function");
            }

            if (!Array.isArray(live.controls) || live.controls.length === 0) {
                problems.push("live.controls must be a non-empty array");
            } else {
                for (const field of live.controls) {
                    if (!(PLUGIN_LIVE_CONTROLLABLE as readonly unknown[]).includes(field)) {
                        problems.push(`live.controls has unknown field "${field}", expected one of: ${PLUGIN_LIVE_CONTROLLABLE.join(", ")}`);
                    }
                }
            }
        }
    }

    if (plugin.handle_push === undefined && plugin.live === undefined) {
        problems.push("it needs a handle_push function, a live object, or both");
    }

    if (plugin.display_name !== undefined && typeof plugin.display_name !== "string") {
        problems.push("display_name must be a string");
    }

    return problems;
}
