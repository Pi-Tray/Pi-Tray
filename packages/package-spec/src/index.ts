import {has_kind_prefix, parser_order, ParserOutputs, parsers, UsableParserKind} from "./parsers";
import {Parser} from "./types";

// npm's package name rules: name or @scope/name, lowercase. also what keeps a name from pointing outside plugin_dir
export const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

// what @pi-tray/plugin-build allows a plugin's export name to be
export const PLUGIN_NAME_PATTERN = /^[A-Za-z0-9_$-]+$/;

export const is_valid_package_name = (package_name: string): boolean => PACKAGE_NAME_PATTERN.test(package_name);

/**
 * Splits a cell's plugin reference into its package and plugin, e.g. @pi-tray/builtin/run_command
 * into @pi-tray/builtin and run_command. A scoped package's name has two parts, anything else one.
 * @throws if it isn't a valid reference
 */
export const split_plugin_reference = (reference: string): { package_name: string, plugin_name: string } => {
    const parts = reference.split("/");
    const package_part_count = reference.startsWith("@") ? 2 : 1;

    const package_name = parts.slice(0, package_part_count).join("/");
    const plugin_name = parts[package_part_count];

    if (parts.length !== package_part_count + 1 || !is_valid_package_name(package_name) || !PLUGIN_NAME_PATTERN.test(plugin_name)) {
        throw new Error(`"${reference}" isn't a plugin reference like <package>/<plugin> or @<scope>/<package>/<plugin>`);
    }

    return {package_name, plugin_name};
}

// the parser's output with kind added, a union over every kind unless narrowed to one
export type ParsedSpec<Kind extends UsableParserKind = UsableParserKind> =
    {[Each in Kind]: ParserOutputs[Each] & {kind: Each}}[Kind];

// generic over the kind, so the parser and its output are known to match
const parse_with = <Kind extends UsableParserKind>(kind: Kind, spec: string): ParsedSpec<Kind> => {
    return {...parsers[kind].parse(spec), kind};
}

const format_with = <Kind extends UsableParserKind>(parsed: ParsedSpec<Kind>): string => {
    const parser: Parser<Kind, ParserOutputs[Kind]> = parsers[parsed.kind];
    return `${parsed.kind}:${parser.format(parsed)}`;
}

export type ParseResult = {ok: true, spec: ParsedSpec} | {ok: false, error: string};

const try_parse_with = (kind: UsableParserKind, spec: string): ParseResult => {
    try {
        return {ok: true, spec: parse_with(kind, spec)};
    } catch (error) {
        return {ok: false, error: error instanceof Error ? error.message : String(error)};
    }
}

export const parse_spec = (spec: string): ParseResult => {
    const trimmed = spec.trim();
    const prefixed = has_kind_prefix(trimmed);

    // prefixing takes precedence over detection, so if a prefix is present, we use that parser
    if (prefixed) {
        return try_parse_with(prefixed, trimmed.slice(prefixed.length + 1));
    }

    for (const parser of parser_order) {
        if (parser.detect_kind(trimmed)) {
            return try_parse_with(parser.kind, trimmed);
        }
    }

    return {ok: false, error: "Not a recognised specifier"};
}

export const format_spec = (parsed: ParsedSpec): string => {
    return format_with(parsed);
}

export const is_trusted_source = (parsed: ParsedSpec): boolean => (parsed.kind === "github" && parsed.owner.toLowerCase() === "pi-tray");
