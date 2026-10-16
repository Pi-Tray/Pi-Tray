import {usePairingCode} from "../../contexts/WSContext";

export const PairingUI = () => {
    const code = usePairingCode();

    if (!code) {
        return null;
    }

    // TODO: style
    return (
        <div>
            <p>Pairing code: {code}</p>
        </div>
    );
}
