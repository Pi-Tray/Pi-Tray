/**
 * The action to perform in a WebSocket message.<br>
 * E.g. "hello", "set_cells", "push", etc.
 */
export type MessageAction = string;

/**
 * The payload for a WebSocket message, can be anything, but must be json serialisable.
 */
export type MessagePayload = any | undefined;

export interface MessageData {
    action: MessageAction;
    payload: MessagePayload;
}


export interface PluginConfigReference {
    /**
     * The name of the plugin to use.
     */
    name: string;

    /**
     * The configuration for the plugin, if any.
     */
    config?: { [key: string]: any };
}

/**
 * A reference to a plugin, either by name or by a configuration object.<br>
 * If the plugin has no configuration, it can be referenced by name only, just providing the name as a string.
 */
export type PluginReference = string | PluginConfigReference;

/**
 * The data structure for a cell in the grid.<br>
 * This is loaded from the data directory, specifically from the `rows` directory.
 * @param text the text to display in the cell (default: empty string)
 * @param text_is_icon whether the text should be treated as a Lucide icon name (default: false)
 * @param plugin the name of the plugin that runs when the cell is clicked, or a configuration object for the plugin (default: no plugin)
 * @param background relative asset URL for the background image to use for the cell (default: no background)
 */
export interface CellData {
    text?: string;
    text_is_icon?: boolean;

    plugin?: PluginReference;

    background?: string;
}


/**
 * The parts of a client's connection a plugin can use.<br>
 * A minimal interface rather than the ws library's type, so plugins don't need @types/ws.
 */
export interface PluginSocket {
    /**
     * Sends a message to the client, e.g. JSON.stringify({action: "...", payload: {...}}).
     */
    send(data: string): void;
}

interface PluginPushHandlerData {
    /**
     * The x coordinate of the button that was pushed.
     */
    x: number;

    /**
     * The y coordinate of the button that was pushed.
     */
    y: number;

    /**
     * The configuration specified for the plugin, if any.
     */
    config?: { [key: string]: any } | undefined;

    /**
     * The connection to the client that pushed the button.
     */
    ws: PluginSocket;

    data_dir: string;
}

export type PluginPushHandler = (data: PluginPushHandlerData) => Promise<void>;

type PluginConfigTemplate_PrimitiveFieldType = "string" | "number" | "boolean";
type PluginConfigTemplate_FieldType = PluginConfigTemplate_PrimitiveFieldType | "array" | "object";

type PluginConfigTemplate_FieldHint = "password";

type PluginConfigTemplate_BaseField = {
    type: PluginConfigTemplate_FieldType | PluginConfigTemplate_FieldType[];
    hints?: readonly PluginConfigTemplate_FieldHint[];

    // Supports a small markdown subset: links, bold, italic and inline code.
    description?: string;

    optional?: true;
};

type PluginConfigTemplate_PrimitiveField = PluginConfigTemplate_BaseField & {
    type: PluginConfigTemplate_PrimitiveFieldType;
};

type PluginConfigTemplate_PrimitiveUnionField = PluginConfigTemplate_BaseField & {
    type: PluginConfigTemplate_PrimitiveFieldType[];
};

type PluginConfigTemplate_ArrayField = PluginConfigTemplate_BaseField & {
    type: "array";
    items: PluginConfigTemplate_Field
};

type PluginConfigTemplate_ObjectField = PluginConfigTemplate_BaseField & {
    type: "object";
    properties: {
        [key: string]: PluginConfigTemplate_Field;
    };
};

type PluginConfigTemplate_Field =
    | PluginConfigTemplate_PrimitiveField
    | PluginConfigTemplate_PrimitiveUnionField
    | PluginConfigTemplate_ArrayField
    | PluginConfigTemplate_ObjectField;

/**
 * The configuration template for a plugin.<br>
 * @note You cannot currently use object or array as in a union with other types. A field cannot be both a string and an object, for example.<br>
 * You can still use union types as the type of an object property or array item, however (see example below).
 * @example
 * name: {
 *     type: "string",
 *     description: "The name to use"
 * },
 * data: {
 *     type: "object",
 *     optional: true,
 *     description: "Optional data to use",
 *     properties: {
 *         value: {
 *             type: ["string", "number"],
 *             description: "The value to use, can be a string or a number"
 *         },
 *         arguments: {
 *             type: "array",
 *             optional: true,
 *             description: "Optional array of string or number arguments",
 *             items: {type: ["string", "number"]}
 *         }
 *     }
 * }
 */
export type PluginConfigTemplate = {
    [key: string]: PluginConfigTemplate_Field;
};

export type PluginConfig = { [key: string]: any };

/**
 * What each live control lets a plugin set. label covers text and text_is_icon together,
 * as text_is_icon decides what text means.
 */
export const PLUGIN_LIVE_CONTROL_FIELDS = {
    label: ["text", "text_is_icon"],
    background: ["background"],
} as const satisfies Record<string, readonly Exclude<keyof CellData, "plugin">[]>;

export const PLUGIN_LIVE_CONTROLLABLE = Object.keys(PLUGIN_LIVE_CONTROL_FIELDS) as (keyof typeof PLUGIN_LIVE_CONTROL_FIELDS)[];

export type PluginLiveControllable = keyof typeof PLUGIN_LIVE_CONTROL_FIELDS;

/**
 * The cell fields a set of controls covers, e.g. "label" covers text and text_is_icon.
 */
export type PluginLiveControlledField<Controls extends PluginLiveControllable> = typeof PLUGIN_LIVE_CONTROL_FIELDS[Controls][number];

export type PluginLiveState<Controls extends PluginLiveControllable> = Partial<Pick<CellData, PluginLiveControlledField<Controls>>>;

export interface PluginLiveContext<Controls extends PluginLiveControllable> {
    config: PluginConfig;
    update: (state: PluginLiveState<Controls>) => void;

    data_dir: string;

    /**
     * Aborted when the tile stops, e.g. its cell or config changed or the plugin was reloaded.
     */
    signal: AbortSignal;

    x: number;
    y: number;
}

export interface PluginLiveConfig<Controls extends PluginLiveControllable = PluginLiveControllable> {
    /**
     * The cell fields this plugin sets. Editors grey these out, and update() only accepts these.
     */
    controls: readonly Controls[];

    /**
     * Called by the server when the tile should start. Return a cleanup function, or use context.signal.
     */
    init(context: PluginLiveContext<Controls>): void | (() => void);
}

export interface Plugin<Controls extends PluginLiveControllable = PluginLiveControllable> {
    /**
     * Short label for what the plugin does, shown wherever a plugin is listed or selected.<br>
     * Write it as an action in a few words, e.g. "Open a path" or "Run a command".<br>
     * You should specify this, but otherwise it will default to the name of the module.
     */
    display_name?: string;

    /**
     * Optional detail that doesn't fit in the display name, shown under it in the plugin picker.<br>
     * Use it for how the plugin behaves, what it needs, and any caveats, rather than repeating the display name.<br>
     * e.g. "Requires Voicemeeter to be running. The sound plays on the first virtual input."<br>
     * Supports a small markdown subset: links, bold, italic and inline code.
     */
    description?: string;

    /**
     * The configuration template for the plugin, if any.<br>
     * This will NOT be validated by the server, but allows editors to provide a UI for configuring/checking the plugin.
     */
    config_template?: PluginConfigTemplate;

    /**
     * The function that is fired when a button using this plugin is pushed.
     */
    handle_push?: PluginPushHandler;

    /**
     * Properties for live plugins.
     */
    live?: PluginLiveConfig<Controls>;
}

export * from "./assets.js";
export * from "./plugins.js";
export * from "./messages.js";
