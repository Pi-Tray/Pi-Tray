import {useCallback, useEffect, useRef, useState} from "react";
import {ConfigKey, useConfigValue} from "../util/config";

interface BaseSettingProps {
    label: string;
    tooltip?: string;
    config_key: ConfigKey;
    className? : string;
    disabled? : boolean;
}

interface ToggleSettingProps extends BaseSettingProps {
    invert?: boolean;
}

/**
 * A control to toggle a boolean config key.
 * @param label the label to display next to the control
 * @param config_key the config key to read and set
 * @param tooltip an optional tooltip to show when hovering the control
 * @param invert if true, will set the config value as false when toggled on, and true when toggled off (default: false)
 * @param className additional class names to apply to the element
 * @param disabled whether the input should show as disabled (default: false)
 * @returns the element
 */
const ToggleSetting = ({label, config_key, tooltip, invert, className = "", disabled = false}: ToggleSettingProps) => {
    const [value, setValue] = useConfigValue(config_key);

    return (
        <label className={`label ${className}`}>
            {label}

            <input
                type="checkbox"
                className="toggle toggle-primary"

                title={tooltip}

                checked={invert ? !value : value}
                onChange={
                    (e) => setValue(invert ? !e.target.checked : e.target.checked)
                }

                disabled={disabled}
            />
        </label>
    );
}


interface TextSettingProps extends BaseSettingProps {
    placeholder?: string;
    type?: "text" | "number" | "password" | "url" | "email" | "tel" | "search" | "date" | "time";
    button_text?: string;
    validate?: (value: string) => "" | string; // returns an error message if invalid, or an empty string if valid
    pattern?: string;
}

/**
 * A control to set a string config value.
 * @param label the label to display next to the control
 * @param config_key the config key to read and set
 * @param tooltip an optional tooltip to show when hovering the control
 * @param placeholder optional placeholder text to show when the input is empty
 * @param button_text text to show in the save button (default: "Apply")
 * @param type the type of the input form, e.g. "text", "number", "email" (default: "text")
 * @param pattern optional validation pattern to use for the input field
 * @param validate optional custom validation function, returning the error as a string, or "" if validation is successful
 * @param className additional class names to apply to the element
 * @param disabled whether the input should show as disabled (default: false)
 * @returns the element
 */
const TextSetting = ({label, config_key, tooltip, placeholder,  button_text = "Apply", type = "text", pattern, validate, className = "", disabled = false}: TextSettingProps) => {
    const [config_value, setConfigValue] = useConfigValue(config_key);
    const [input_value, setInputValue] = useState(config_value || "");

    const input_ref = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // update input value when config value changes
        setInputValue(config_value || "");
    }, [config_value]);

    const validate_and_set = useCallback(
        (value: string) => {
            if (validate) {
                const error = validate(value);

                if (error) {
                    // if validation fails, show an alert and don't set the value
                    input_ref.current?.setCustomValidity(error);
                    input_ref.current?.reportValidity();
                    return;
                }
            }

            setConfigValue(value);
        },
        [setConfigValue, validate, input_ref]
    );

    return (
        <div className={`flex gap-2 items-center ${className}`}>
            <label className="label">
                {label}

                <input
                    ref={input_ref}

                    type={type}
                    className="input input-bordered w-full max-w-xs"
                    placeholder={placeholder}

                    title={tooltip}

                    defaultValue={config_value}
                    value={input_value}
                    onChange={
                        (e) => {
                            input_ref.current?.setCustomValidity("");
                            setInputValue(e.target.value);
                        }
                    }

                    pattern={pattern}

                    disabled={disabled}
                />
            </label>

            <button
                className="btn btn-primary"
                onClick={
                    () => {
                        validate_and_set(input_value);
                    }
                }
                disabled={disabled}
            >
                {button_text}
            </button>
        </div>
    );
}

export const SettingsPage = () => {
    const [ws_url_overridden] = useConfigValue("dont_overwrite_ws_url");
    const ws_url_locked = !ws_url_overridden;

    const validate_ws_url = useCallback(
        (value: string) => {
            try {
                const url = new URL(value);

                if (url.protocol !== "ws:" && url.protocol !== "wss:") {
                    return "WebSocket URL must start with ws:// or wss://";
                }

                return "";
            } catch (e) {
                return "Invalid URL.";
            }
        },
        []
    );

    return (
        <>
            <h1 className="text-2xl font-bold">Settings</h1>

            <div className="flex flex-wrap gap-8 mt-4">
                <ToggleSetting
                    label="Show DevTools"
                    config_key="devtools"

                    tooltip="Enable or disable the DevTools page."
                />

                <div className="flex flex-col gap-4 items-end">
                    <TextSetting
                        label="WebSocket URL"
                        config_key="ws_url"

                        tooltip="The address which Pi-Tray Server is listening on for WebSocket connections."

                        type="url"
                        validate={validate_ws_url}
                        //pattern="^wss?://.+"

                        disabled={ws_url_locked}
                    />

                    <ToggleSetting
                        label="Set automatically"
                        config_key="dont_overwrite_ws_url"
                        invert={true}

                        tooltip="If enabled, the WebSocket URL will be automatically set by the server process when it starts.&#013;Disable to prevent this behaviour and set a custom URL.&#013;The server will need to be restarted to have it update the value."
                    />
                </div>
            </div>
        </>
    );
}
