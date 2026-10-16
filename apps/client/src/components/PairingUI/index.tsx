import {usePairingCode} from "../../contexts/WSContext";

export const PairingUI = () => {
    const code = usePairingCode();

    if (!code) {
        return null;
    }

    // TODO: style
    // TODO: show time remaining as a progress bar
    return (
        <div>
            <p>Pairing code: {code}</p>
        </div>
    );
}
