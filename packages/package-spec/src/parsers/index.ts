import github from "./github";
import url from "./url";
import file from "./file";
import {Parser} from "../types";

// order matters, precedence is in array order for detect_kind matching
export const parser_order = [
    file,
    github,
    url
] as const;

export type UsableParser = typeof parser_order[number];
export type UsableParserKind = UsableParser["kind"];

// each kind's parsed output, and its parser, as mapped types so indexing with a generic kind keeps them paired
export type ParserOutputs = {[Kind in UsableParserKind]: ReturnType<Extract<UsableParser, {kind: Kind}>["parse"]>};
export type ParserMap = {[Kind in UsableParserKind]: Parser<Kind, ParserOutputs[Kind]>};

export const parsers: ParserMap = {
    github,
    url,
    file
};

export const has_kind_prefix = (spec: string): UsableParserKind | undefined => {
    for (const parser of parser_order) {
        if (spec.startsWith(`${parser.kind}:`)) {
            return parser.kind;
        }
    }
    return undefined;
};
