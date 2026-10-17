import {define_parser} from "../types";

const parse_http_url = (spec: string): URL | null => {
    try {
        const url = new URL(spec);
        return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
        return null;
    }
}

export default define_parser({
    kind: "url",
    detect_kind: (spec: string) => parse_http_url(spec) !== null,
    parse: (spec: string): {url: string} => {
        if (!parse_http_url(spec)) {
            throw new Error(`"${spec}" isn't an http or https link`);
        }
        return {url: spec};
    },
    format: ({url}) => new URL(url).href,
    locate: ({url}) => ({type: "manifest", url})
});
