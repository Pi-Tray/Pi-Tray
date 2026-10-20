import {CSSProperties, memo, ReactNode} from "react";

import {AutoTextScale} from "../AutoTextScale";
import {CustomDynamicIcon} from "../CustomDynamicIcon";

import styles from "./component.module.css";

/**
 * What a button shows, however the app got it.
 */
export interface PushButtonDisplay {
    text: string;
    text_is_icon: boolean;

    /** Any url an image can load from, e.g. an object url or a file preview, or null for none */
    background_url: string | null;

    /** Missing counts as pushable */
    pushable?: boolean;
}

export type PushButtonResult = "success" | "failure" | null;

interface PushButtonFaceProps {
    /** null for an empty button */
    display: PushButtonDisplay | null;

    /** Briefly outlines the button after a push */
    result?: PushButtonResult;

    highlighted?: boolean;

    /** Shown in the top right corner, e.g. a small icon */
    badge?: ReactNode;
    badge_title?: string;

    on_click?: () => void;

    className?: string;
    style?: CSSProperties;
}

const RESULT_CLASSES: Record<NonNullable<PushButtonResult>, string> = {
    success: styles.success,
    failure: styles.failure
};

/**
 * A grid button as it appears on screen, with no idea where its contents come from or what pushing it does.
 * @returns the element
 */
export const PushButtonFace = memo(({display, result = null, highlighted = false, badge, badge_title, on_click, className, style}: PushButtonFaceProps) => {
    const text = display?.text ?? "";
    const pushable = display?.pushable !== false && display !== null;

    let content: ReactNode = null;
    if (text) {
        content = display?.text_is_icon
            ? <CustomDynamicIcon name={text} className={styles.icon} />
            : <AutoTextScale>{text}</AutoTextScale>;
    }

    // JSON.stringify quotes and escapes the url, so it can't break out of the css url()
    const button_style: CSSProperties = display?.background_url
        ? {...style, backgroundImage: `url(${JSON.stringify(display.background_url)})`, backgroundSize: "cover", backgroundPosition: "center"}
        : {...style};

    const classes = [
        styles.element,
        result ? RESULT_CLASSES[result] : "",
        highlighted ? styles.highlighted : "",
        className ?? ""
    ].filter(Boolean).join(" ");

    return (
        <button style={button_style} className={classes} onClick={pushable ? on_click : undefined} aria-disabled={!pushable}>
            {content}
            {badge && <span className={styles.badge} title={badge_title}>{badge}</span>}
        </button>
    );
});
