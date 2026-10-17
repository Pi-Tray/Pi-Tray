import {define_parser} from "../types";

export default define_parser({
    kind: "url",
    detect_kind: (spec: string) => {
        try {
            new URL(spec);
            return true;
        } catch {
            return false;
        }
    },
    parse: (spec: string) => {
        return {url: spec};
    },
    format: ({url}) => new URL(url).href
});
