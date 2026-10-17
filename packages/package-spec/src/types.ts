export type SpecLocation = {type: "manifest", url: string} | {type: "archive", path: string};

export interface Parser<Kind extends string, Output> {
    kind: Kind;
    detect_kind: (spec: string) => boolean;
    parse: (spec: string) => Output;

    // format the spec to a normalised source, not version dependent (i.e. omit version/tag if present)
    format: (output: Output) => string;

    locate: (output: Output) => SpecLocation;
}

export const define_parser = <Kind extends string, Output>(parser: Parser<Kind, Output>): Parser<Kind, Output> => parser;
