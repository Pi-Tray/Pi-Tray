import {define_parser} from "../types";

// owner/repo[@tag], or a github url to the repo or one of its release tags, with or without .git or a trailing slash
const GITHUB_PATTERN = /^(?:https?:\/\/(?:www\.)?github\.com\/)?([^\/@\s]+)\/([^\/@\s]+?)(?:\.git)?(?:@([^\/@\s]+)|\/releases\/tag\/([^\/\s]+))?\/?$/i;

export default define_parser({
    kind: "github",
    detect_kind: (spec: string) => GITHUB_PATTERN.test(spec),
    parse: (spec: string): {owner: string, repo: string, tag?: string} => {
        const match = spec.match(GITHUB_PATTERN);
        if (!match) {
            throw new Error(`"${spec}" isn't a GitHub repo, use owner/repo, owner/repo@tag or a link to the repo or a release`);
        }
        const [, owner, repo, shorthand_tag, url_tag] = match;
        const tag = shorthand_tag ?? url_tag;
        if ([owner, repo, tag].some((segment) => segment === "." || segment === "..")) {
            throw new Error(`"${spec}" isn't a GitHub repo, the owner, repo and tag can't be "." or ".."`);
        }
        return {owner, repo, tag};
    },
    format: ({owner, repo}) => `${owner}/${repo}`.toLowerCase(),
    locate: ({owner, repo, tag}) => {
        if ([owner, repo, tag].some((segment) => segment === "." || segment === "..")) {
            throw new Error(`"${owner}/${repo}${tag ? `@${tag}` : ""}" isn't a GitHub repo, the owner, repo and tag can't be "." or ".."`);
        }

        const repo_url = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
        return {
            type: "manifest",
            url: tag
                ? `${repo_url}/releases/download/${encodeURIComponent(tag)}/manifest.json`
                : `${repo_url}/releases/latest/download/manifest.json`
        };
    }
});
