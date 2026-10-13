import { useEffect, useState } from "react";

export const useDebounce = <T>(value: T, delay = 1000): T => {
    const [debounced_value, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]);

    return debounced_value;
};
