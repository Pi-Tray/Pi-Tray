import {useState, useLayoutEffect, useRef, CSSProperties} from 'react';

// copied exactly from the client
// TODO: would be good to have some unified component package rather than duplicating this code by hand

type AutoTextScaleProps = {
    children: string;
    style?: CSSProperties;
    className?: string;
};

// this was vibe coded with gemini because this stuff is a pain
// TODO: match style to rest of codebase and add doc

export const AutoTextScale = ({
    children,
    style,
    className,
}: AutoTextScaleProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);

    // State now holds the entire style object for the text
    const [computedStyle, setComputedStyle] = useState<CSSProperties>({});

    useLayoutEffect(() => {
        const container = containerRef.current;
        const textElement = textRef.current;

        if (!container || !textElement || !children) return;

        // This function now takes a wrapping style and calculates the max font size for it
        const calculateMaxFontSize = (wrappingStyle: CSSProperties): number => {
            // Temporarily apply wrapping style for measurement
            Object.assign(textElement.style, wrappingStyle);

            const {width: containerWidth, height: containerHeight} = container.getBoundingClientRect();
            let minFont = 1;
            let maxFont = containerHeight;
            let bestSize = minFont;

            while (minFont <= maxFont) {
                const midFont = (minFont + maxFont) / 2;
                textElement.style.fontSize = `${midFont}px`;

                const isOverflowing =
                    textElement.scrollHeight > containerHeight || textElement.scrollWidth > containerWidth;

                if (isOverflowing) {
                    maxFont = midFont - 1;
                } else {
                    bestSize = midFont;
                    minFont = midFont + 1;
                }
            }
            return bestSize;
        };

        const fitText = () => {
            const standardWrapStyle: CSSProperties = {overflowWrap: 'break-word', wordBreak: 'normal'};
            const standardSize = calculateMaxFontSize(standardWrapStyle);

            let finalSize = standardSize;
            let finalWrapStyle = standardWrapStyle;

            // Set the final calculated style in state
            setComputedStyle({
                ...finalWrapStyle,
                fontSize: `${finalSize}px`,
                lineHeight: `${finalSize * 1.2}px`, // Adjust line height based on font size
            });
        };

        // Use an observer to refit text on container resize
        const resizeObserver = new ResizeObserver(fitText);
        resizeObserver.observe(container);

        // Cleanup observer on unmount
        return () => resizeObserver.disconnect();
    }, [children]);

    // Base styles that are always applied
    const baseTextStyles: CSSProperties = {
        margin: 0,
        padding: 0,
        textAlign: 'center',
        display: 'inline-block',
        verticalAlign: 'middle',
        whiteSpace: 'normal',
    };

    return (
        <div ref={containerRef} style={{
            ...style,
            overflow: 'hidden',
            width: "100%",
            height: "100%",
            padding: "1%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
        }} className={className}>
      <span ref={textRef} style={{...baseTextStyles, ...computedStyle}}>
        {children}
      </span>
        </div>
    );
};