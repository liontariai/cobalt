import type { $$types } from "../../../../.types/tests.unions.gql-unions.root.$$types";
type SearchResult =
    | {
          title: string;
          description: string;
      }
    | {
          url: string;
      };

export function Query(): SearchResult {
    return {
        title: "Hello, World!",
        description: "This is a test",
    };
}

// Your resolver returns a Union Type. Therefore you must provide a resolveType function that resolves the abstract union type to a concrete type by it's typename.
// The following fully-typed template has been added by cobalt. Please make sure it resolves correctly, like the types indicate.
Query.resolveType = (
    value: $$types.Unions["_title_string_description_string_url_string_"],
): $$types.UnionsResolveToTypename["_title_string_description_string_url_string_"] => {
    if ("url" in value) {
        return "_url_string_";
    }
    return "_title_string_description_string_";
};
