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
    dim_bg?: boolean;

    /** Missing counts as pushable */
    pushable?: boolean;
}

export type PushButtonResult = "success" | "failure";
export type PushButtonState = PushButtonResult | "pending" | null;

interface PushButtonFaceProps {
    /** null for an empty button */
    display: PushButtonDisplay | null;

    /** Outline state of the button after a push, or "pending" for a push in progress */
    state?: PushButtonState;

    highlighted?: boolean;

    /** Shown in the top right corner, e.g. a small icon */
    badge?: ReactNode;
    badge_title?: string;

    on_click?: () => void;

    className?: string;
    style?: CSSProperties;
}

const STATE_CLASSES: Record<NonNullable<PushButtonState>, string> = {
    pending: styles.pending,
    success: styles.success,
    failure: styles.failure
};

/**
 * A grid button as it appears on screen, with no idea where its contents come from or what pushing it does.
 * @returns the element
 */
export const PushButtonFace = memo(({display, state = null, highlighted = false, badge, badge_title, on_click, className, style}: PushButtonFaceProps) => {
    const text = display?.text ?? "";
    const pushable = display?.pushable !== false;

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
        state ? STATE_CLASSES[state] : "",
        highlighted ? styles.highlighted : "",
        className ?? "",
        content && display?.dim_bg !== false ? styles.dim_bg : ""
    ].filter(Boolean).join(" ");

    return (
        <button style={button_style} className={classes} onClick={pushable ? on_click : undefined} aria-disabled={!pushable}>
            {content}
            {badge && <span className={styles.badge} title={badge_title}>{badge}</span>}
        </button>
    );
});
