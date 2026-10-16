import styles from "./component.module.css";

import {usePairingCode} from "../../contexts/WSContext";
import {format_code} from "@pi-tray/secure-channel";

export const PairingUI = () => {
    const code = usePairingCode();

    if (!code) {
        return null;
    }

    // TODO: style
    // TODO: show time remaining as a progress bar
    return (
        <div className={styles.element}>
            <p>Pairing code:</p>
            <p className={styles.code}>{format_code(code)}</p>

            <p>Pair in Pi-Tray Editor:</p>
            <ul>
                <li>Open Pi-Tray Editor</li>
                <li>Click onto the "Devices" tab</li>
                <li>Click "Pair new device"</li>
                <li>Enter the pairing code above and click "Pair device"</li>
            </ul>
        </div>
    );
}
