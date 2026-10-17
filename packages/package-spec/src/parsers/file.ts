import {define_parser} from "../types";

const PATH_PATTERN = /^(\.{1,2}[\\/]|[\\/]|~[\\/]|[A-Za-z]:[\\/])|\.tgz$/i;

export default define_parser({
    kind: "file",
    detect_kind: (spec: string) => {
        return PATH_PATTERN.test(spec);
    },
    parse: (spec: string) => {
        return {path: spec};
    },
    format: ({path}) => path
});
