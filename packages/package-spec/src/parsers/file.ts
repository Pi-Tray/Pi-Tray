import {define_parser} from "../types";

const PATH_PATTERN = /^(\.{1,2}[\\/]|[\\/]|~[\\/]|[A-Za-z]:[\\/])|\.tgz$/i;

export default define_parser({
    kind: "file",
    detect_kind: (spec: string) => PATH_PATTERN.test(spec),
    parse: (spec: string) => ({path: spec}),
    format: ({path}) => path,
    locate: ({path}) => ({type: "archive", path})
});
