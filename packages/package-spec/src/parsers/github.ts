import {define_parser} from "../types";

// accept both shorthand owner/repo@tag (tag is optional), as well as github repo url with or without .git
const GITHUB_PATTERN = /^(?:https?:\/\/github\.com\/)?([^\/]+)\/([^\/]+)(?:\.git)?(?:@(.+))?$/;

export default define_parser({
    kind: "github",
    detect_kind: (spec: string) => {
        return GITHUB_PATTERN.test(spec);
    },
    parse: (spec: string): {owner: string, repo: string, tag?: string} => {
        const match = spec.match(GITHUB_PATTERN);
        if (!match) {
            throw new Error(`Invalid GitHub spec: ${spec}`);
        }
        const [, owner, repo, shorthand_tag, url_tag] = match;
        return {owner, repo, tag: shorthand_tag ?? url_tag};
    },
    format: ({owner, repo}) => `${owner}/${repo}`.toLowerCase()
});
