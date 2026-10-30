import {useLayoutEffect, useRef, CSSProperties} from "react";

type AutoTextScaleProps = {
    children: string;
    style?: CSSProperties;
    className?: string;
};

const LINE_HEIGHT_RATIO = 1.2;

const TEXT_STYLES: CSSProperties = {
    margin: 0,
    padding: 0,
    textAlign: "center",
    display: "inline-block",
    verticalAlign: "middle",
    whiteSpace: "normal",
    overflowWrap: "break-word",
    wordBreak: "normal",
};

/**
 * Renders text at the largest font size that fits its container, wrapping between words where needed.
 * Refits when the container resizes, the text changes, or web fonts finish loading.
 * Font size is written straight to the span rather than through state, so the DOM always holds the final fitted size.
 */
export const AutoTextScale = ({children, style, className}: AutoTextScaleProps) => {
    const container_ref = useRef<HTMLDivElement>(null);
    const text_ref = useRef<HTMLSpanElement>(null);

    useLayoutEffect(() => {
        const container = container_ref.current;
        const text_element = text_ref.current;
        if (!container || !text_element || !children) return;

        let disposed = false;

        const apply_font_size = (font_size: number) => {
            text_element.style.fontSize = `${font_size}px`;
            text_element.style.lineHeight = `${font_size * LINE_HEIGHT_RATIO}px`;
        };

        const fit_text = () => {
            if (disposed) return;

            const container_styles = getComputedStyle(container);
            const available_width = container.clientWidth - parseFloat(container_styles.paddingLeft) - parseFloat(container_styles.paddingRight);
            const available_height = container.clientHeight - parseFloat(container_styles.paddingTop) - parseFloat(container_styles.paddingBottom);

            // the container can be 0 mid-layout; fitting to that would lock the text at 1px
            if (available_width <= 0 || available_height <= 0) return;

            let smallest_size = 1;
            let largest_size = Math.floor(available_height);
            let best_size = smallest_size;

            while (smallest_size <= largest_size) {
                const candidate_size = Math.floor((smallest_size + largest_size) / 2);
                apply_font_size(candidate_size);

                const is_overflowing = text_element.scrollWidth > available_width || text_element.scrollHeight > available_height;
                if (is_overflowing) {
                    largest_size = candidate_size - 1;
                } else {
                    best_size = candidate_size;
                    smallest_size = candidate_size + 1;
                }
            }

            apply_font_size(best_size);
        };

        fit_text();

        const resize_observer = new ResizeObserver(fit_text);
        resize_observer.observe(container);
        document.fonts.ready.then(fit_text);

        return () => {
            disposed = true;
            resize_observer.disconnect();
        };
    }, [children]);

    return (
        <div ref={container_ref} className={className} style={{
            ...style,
            overflow: "hidden",
            width: "100%",
            height: "100%",
            padding: "1%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        }}>
            <span ref={text_ref} style={TEXT_STYLES}>{children}</span>
        </div>
    );
};