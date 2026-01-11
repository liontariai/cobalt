import type { $$types } from "../../../../../.types/tests.unions.gql-unions.in-obj.with-args.$$types";
export function Query(returnUrl: boolean) {
    if (returnUrl) {
        return {
            value: {
                url: "https://www.google.com",
            },
        };
    }
    return {
        value: {
            title: "Hello, World!",
            description: "This is a test",
        },
    };
}

// Your resolver returns a Union Type. Therefore you must provide a resolveType function that resolves the abstract union type to a concrete type by it's typename.
// The following fully-typed template has been added by cobalt. Please make sure it resolves correctly, like the types indicate.
Query.resolveType = (
    value: $$types.Unions["_value_url_string_title_undefined_description_undefined_value_title_string_description_string_url_undefined_"],
): $$types.UnionsResolveToTypename["_value_url_string_title_undefined_description_undefined_value_title_string_description_string_url_undefined_"] => {
    if ("url" in value.value) {
        return "_value_url_string_title_undefined_description_undefined_";
    }
    return "_value_title_string_description_string_url_undefined_";
};
