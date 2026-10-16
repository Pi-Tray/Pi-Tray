import React, {HTMLAttributes, useEffect, useRef, useState} from "react";

export type BoxSize = "sm" | "md" | "lg";

export interface CodeEntryProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
    length?: number;
    value?: string;
    on_change?: (value: string) => void;
    on_submit?: (value: string) => void;
    group_size?: number;
    group_gap?: string;
    gap?: string;
    box_size?: BoxSize;
    auto_focus?: boolean;
    disabled?: boolean;
    separator_char?: string;
    status?: "idle" | "success" | "error";
}

const SIZE_CLASSES: Record<BoxSize, string> = {
    sm: "w-8 h-10 text-base",
    md: "w-10 h-12 text-xl sm:w-12 sm:h-14",
    lg: "w-14 h-16 text-2xl",
};

const STATUS_CLASSES = {
    idle: "",
    success: "input-success",
    error: "input-error",
};

export const CodeEntry = ({
    length = 8,
    value,
    on_change,
    on_submit,
    group_size = 4,
    group_gap = "gap-6",
    gap = "gap-2",
    color = "primary",
    box_size = "md",
    auto_focus = true,
    disabled = false,
    separator_char = "-",
    status = "idle",
    className = "",
    ...div_props
}: CodeEntryProps) => {
    const [internal_value, setInternalValue] = useState(value ?? "");
    const input_refs = useRef<(HTMLInputElement | null)[]>([]);

    const current_value = value ?? internal_value;
    const digits = Array.from({length}, (_, digit_index) => current_value[digit_index] ?? "");

    const focus_box = (index: number) => {
        const clamped_index = Math.max(0, Math.min(index, length - 1));
        input_refs.current[clamped_index]?.focus();
    };

    const update_value = (next_value: string) => {
        const clean_value = next_value.replace(/\D/g, "").slice(0, length);
        if (value === undefined) setInternalValue(clean_value);
        on_change?.(clean_value);
        if (clean_value.length === length && clean_value !== current_value) on_submit?.(clean_value);
    };

    useEffect(() => {
        if (auto_focus && !disabled) focus_box(current_value.length);
    }, [auto_focus]);

    const handle_change = (event: React.ChangeEvent<HTMLInputElement>, index: number) => {
        const typed_digit = event.target.value.replace(/\D/g, "").slice(-1);
        if (!typed_digit) return;

        const insert_index = Math.min(index, current_value.length);
        update_value(current_value.slice(0, insert_index) + typed_digit + current_value.slice(insert_index + 1));
        focus_box(insert_index + 1);
    };

    const handle_key_down = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (event.key === "Backspace") {
            event.preventDefault();
            const delete_index = digits[index] ? index : index - 1;
            if (delete_index < 0) return;
            update_value(current_value.slice(0, delete_index) + current_value.slice(delete_index + 1));
            focus_box(delete_index);
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            focus_box(index - 1);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            focus_box(index + 1);
        } else if (event.key === "Enter" && current_value.length === length) {
            on_submit?.(current_value);
        }
    };

    const handle_paste = (event: React.ClipboardEvent<HTMLInputElement>) => {
        event.preventDefault();
        const pasted_digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
        if (!pasted_digits) return;
        update_value(pasted_digits);
        focus_box(pasted_digits.length);
    };

    const chunk_size = group_size > 0 ? group_size : length;
    const groups = Array.from({length: Math.ceil(length / chunk_size)}, (_, group_index) => {
        const start_index = group_index * chunk_size;
        return Array.from({length: Math.min(chunk_size, length - start_index)}, (_, offset) => start_index + offset);
    });

    return (
        <div className={`my-2 w-full flex justify-center ${className}`} {...div_props}>
            <div className={`flex flex-wrap items-center justify-center ${group_gap}`}>
                {groups.map((group_indices, group_index) => (
                    <React.Fragment key={group_index}>
                        {separator_char && group_index > 0 && (
                            <span className="text-base-content/40 font-mono font-bold text-xl select-none px-0.5">
                                {separator_char}
                            </span>
                        )}
                        <div className={`flex items-center ${gap}`}>
                            {group_indices.map((index) => (
                                <input
                                    key={index}
                                    ref={(element) => {
                                        input_refs.current[index] = element;
                                    }}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={1}
                                    value={digits[index]}
                                    disabled={disabled}
                                    onChange={(event) => handle_change(event, index)}
                                    onKeyDown={(event) => handle_key_down(event, index)}
                                    onPaste={handle_paste}
                                    onFocus={(event) => event.target.select()}
                                    aria-label={`Digit ${index + 1} of ${length}`}
                                    className={`
                                        input text-center font-mono font-bold px-0 rounded-lg text-base-content
                                        transition-all duration-200 focus:scale-105 focus:shadow-md
                                        ${digits[index] ? "bg-base-200/50" : "bg-base-100"}
                                        ${SIZE_CLASSES[box_size]}
                                        ${STATUS_CLASSES[status]}
                                        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
                                    `}
                                />
                            ))}
                        </div>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};
