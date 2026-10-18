// Promise-based replacements for the browser's blocking alert()/confirm().
// A single <DialogHost /> (mounted in App) renders the queued requests as daisyui modals,
// while show_alert/show_confirm can be called from anywhere, including plain modules outside React.

export type DialogTone = "default" | "danger";

export interface DialogRequest {
    id: number;
    kind: "alert" | "confirm";
    title?: string;
    message: string;
    confirm_label: string;
    cancel_label: string;
    tone: DialogTone;
    resolve: (confirmed: boolean) => void;
}

export interface AlertOptions {
    title?: string;
    message: string;
    button_label?: string;
}

export interface ConfirmOptions {
    title?: string;
    message: string;
    confirm_label?: string;
    cancel_label?: string;
    tone?: DialogTone;
}

// requests are shown one at a time, in order, like the native dialogs they replace
let queue: DialogRequest[] = [];
let next_id = 1;
const listeners = new Set<() => void>();

const emit = () => {
    for (const listener of listeners) {
        listener();
    }
};

/** Subscribe to queue changes. Returns an unsubscribe function. For use with useSyncExternalStore. */
export const subscribe_dialogs = (listener: () => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

/** The current queue. The reference only changes when the queue changes, so it's safe as a store snapshot. */
export const get_dialog_queue = () => queue;

const enqueue = (request: Omit<DialogRequest, "id" | "resolve">): Promise<boolean> =>
    new Promise<boolean>(resolve => {
        queue = [...queue, {...request, id: next_id++, resolve}];
        emit();
    });

/** Resolve a dialog and remove it from the queue. Calling it twice for the same id is a harmless no-op. */
export const dismiss_dialog = (id: number, confirmed: boolean) => {
    const request = queue.find(entry => entry.id === id);
    if (!request) {
        return;
    }

    queue = queue.filter(entry => entry.id !== id);
    emit();
    request.resolve(confirmed);
};

/**
 * Show a message with a single dismiss button, replacing window.alert.
 * @param options the message, or an object with a title and button label
 * @returns a promise that resolves once the user dismisses it
 */
export const show_alert = (options: AlertOptions | string): Promise<void> => {
    const opts = typeof options === "string" ? {message: options} : options;

    return enqueue({
        kind: "alert",
        title: opts.title,
        message: opts.message,
        confirm_label: opts.button_label ?? "OK",
        cancel_label: "",
        tone: "default"
    }).then(() => undefined);
};

/**
 * Ask the user to confirm or cancel, replacing window.confirm.
 * @param options the message, or an object with a title, button labels and tone
 * @returns a promise that resolves to true if confirmed, false if cancelled or dismissed
 */
export const show_confirm = (options: ConfirmOptions | string): Promise<boolean> => {
    const opts = typeof options === "string" ? {message: options} : options;

    return enqueue({
        kind: "confirm",
        title: opts.title,
        message: opts.message,
        confirm_label: opts.confirm_label ?? "OK",
        cancel_label: opts.cancel_label ?? "Cancel",
        tone: opts.tone ?? "default"
    });
};
