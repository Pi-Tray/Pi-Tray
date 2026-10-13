import {Plus, Trash} from "lucide-react";

import type {PluginConfigTemplate} from "pi-tray-server/src/types";
import {PluginDescription} from "./PluginDescription.tsx";

type TemplateField = PluginConfigTemplate[string];
type PrimitiveType = "string" | "number" | "boolean";
type ConfigObject = { [key: string]: unknown };

/**
 * Narrows any value to a plain object, treating anything else as empty.
 */
const as_config_object = (value: unknown): ConfigObject => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as ConfigObject;
    }

    return {};
}

/**
 * The value a field starts with when it is first added, e.g. a new array item.
 */
const default_for_field = (field: TemplateField): unknown => {
    if ("items" in field) {
        return [];
    }

    if ("properties" in field) {
        return {};
    }

    const primitive_type = (Array.isArray(field.type) ? field.type[0] : field.type) as PrimitiveType;
    return default_for_primitive(primitive_type);
}

const default_for_primitive = (primitive_type: PrimitiveType): unknown => {
    switch (primitive_type) {
        case "string":
            return "";
        case "number":
            return 0;
        case "boolean":
            return false;
    }
}

/**
 * Lists the dotted paths of required fields that have no value, e.g. `["command", "options.timeout"]`.<br>
 * Empty strings count as missing.
 * @param template the template to check against
 * @param value the config to check
 * @param path_prefix used internally when recursing into nested objects
 */
export const find_missing_required = (template: PluginConfigTemplate, value: unknown, path_prefix = ""): string[] => {
    const config_object = as_config_object(value);
    const missing_paths: string[] = [];

    for (const [key, field] of Object.entries(template)) {
        const field_path = path_prefix ? `${path_prefix}.${key}` : key;
        const field_value = config_object[key];

        if (field_value === undefined || field_value === "") {
            if (!field.optional) {
                missing_paths.push(field_path);
            }

            continue;
        }

        if ("properties" in field) {
            missing_paths.push(...find_missing_required(field.properties, field_value, field_path));
        }
    }

    return missing_paths;
}

interface ValueInputProps {
    value: unknown;
    onChange: (new_value: unknown) => void;
}

const PrimitiveInput = ({primitive_type, value, onChange}: ValueInputProps & { primitive_type: PrimitiveType }) => {
    switch (primitive_type) {
        case "boolean":
            return <input type="checkbox" className="toggle" checked={value === true} onChange={event => onChange(event.target.checked)} />;
        case "number":
            return (
                <input
                    type="number"
                    className="input input-bordered w-full"
                    value={typeof value === "number" ? value : ""}
                    onChange={event => onChange(event.target.value === "" ? undefined : Number(event.target.value))}
                />
            );
        case "string":
            return (
                <input
                    type="text"
                    className="input input-bordered w-full"
                    value={typeof value === "string" ? value : ""}
                    onChange={event => onChange(event.target.value)}
                />
            );
    }
}

/**
 * Input for a field that accepts several primitive types, with a selector to pick which one.
 */
const UnionInput = ({primitive_types, value, onChange}: ValueInputProps & { primitive_types: PrimitiveType[] }) => {
    const current_type = primitive_types.find(primitive_type => typeof value === primitive_type) ?? primitive_types[0];

    return (
        <div className="flex gap-2 items-center">
            <select
                className="select select-bordered w-32"
                value={current_type}
                onChange={event => onChange(default_for_primitive(event.target.value as PrimitiveType))}
            >
                {primitive_types.map(primitive_type => (
                    <option key={primitive_type} value={primitive_type}>{primitive_type}</option>
                ))}
            </select>

            <div className="flex-1">
                <PrimitiveInput primitive_type={current_type} value={value} onChange={onChange} />
            </div>
        </div>
    );
}

const ArrayInput = ({items_field, value, onChange}: ValueInputProps & { items_field: TemplateField }) => {
    const items = Array.isArray(value) ? value : [];

    return (
        <div className="flex flex-col gap-2">
            {items.map((item, item_idx) => (
                <div key={item_idx} className="flex items-start gap-2">
                    <div className="flex-1">
                        <FieldValueInput
                            field={items_field}
                            value={item}
                            onChange={new_item => onChange(items.map((existing_item, existing_idx) => existing_idx === item_idx ? new_item : existing_item))}
                        />
                    </div>

                    <button
                        type="button"
                        className="btn btn-ghost btn-square btn-sm mt-1"
                        title="Remove item"
                        onClick={() => onChange(items.filter((_item, existing_idx) => existing_idx !== item_idx))}
                    >
                        <Trash className="w-4 h-4" />
                    </button>
                </div>
            ))}

            <button type="button" className="btn btn-sm btn-outline self-start" onClick={() => onChange([...items, default_for_field(items_field)])}>
                <Plus className="w-4 h-4" />
                Add item
            </button>
        </div>
    );
}

/**
 * Picks the right input for a field based on its template.
 */
const FieldValueInput = ({field, value, onChange}: ValueInputProps & { field: TemplateField }) => {
    if ("items" in field) {
        return <ArrayInput items_field={field.items} value={value} onChange={onChange} />;
    }

    if ("properties" in field) {
        return (
            <div className="border-l-2 border-base-300 pl-3">
                <PluginConfigForm template={field.properties} value={value} onChange={onChange} />
            </div>
        );
    }

    if (Array.isArray(field.type)) {
        return <UnionInput primitive_types={field.type as PrimitiveType[]} value={value} onChange={onChange} />;
    }

    return <PrimitiveInput primitive_type={field.type as PrimitiveType} value={value} onChange={onChange} />;
}

interface PluginConfigFormProps {
    template: PluginConfigTemplate;
    value: unknown;
    onChange: (new_value: ConfigObject) => void;
}

/**
 * A form generated from a plugin's config template.<br>
 * Optional fields left empty are removed from the config rather than saved as empty values.
 * @param template the plugin's config template
 * @param value the current config object
 * @param onChange called with the whole updated config object on every edit
 * @returns the element
 */
export const PluginConfigForm = ({template, value, onChange}: PluginConfigFormProps) => {
    const config_object = as_config_object(value);

    const set_field = (key: string, field: TemplateField, new_value: unknown) => {
        const updated_config = {...config_object};

        if (new_value === undefined || (field.optional && new_value === "")) {
            delete updated_config[key];
        } else {
            updated_config[key] = new_value;
        }

        onChange(updated_config);
    };

    return (
        <div className="flex flex-col gap-4">
            {Object.entries(template).map(([key, field]) => (
                <div key={key} className="flex flex-col gap-1">
                    <span className="font-medium">
                        {key}
                        {field.optional && <span className="font-normal opacity-60"> (optional)</span>}
                    </span>

                    {field.description && <PluginDescription>{field.description}</PluginDescription>}

                    <FieldValueInput field={field} value={config_object[key]} onChange={new_value => set_field(key, field, new_value)} />

                    {field.optional && config_object[key] !== undefined && (
                        <button type="button" className="link link-hover text-sm self-start opacity-70" onClick={() => set_field(key, field, undefined)}>
                            Clear
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
