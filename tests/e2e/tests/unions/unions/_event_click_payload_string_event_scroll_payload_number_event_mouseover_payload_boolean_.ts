import type { $$types } from "../../.types/tests.unions.custom-scalar.in-obj.with-args.$$types";

// Your resolver returns a Union Type. Therefore you must provide a resolveType function that resolves the abstract union type to a concrete type by it's typename.
// The following fully-typed template has been added by cobalt. Please make sure it resolves correctly, like the types indicate.
export const resolveType = (
    value: $$types.Unions["_event_click_payload_string_event_scroll_payload_number_event_mouseover_payload_boolean_"],
): $$types.UnionsResolveToTypename["_event_click_payload_string_event_scroll_payload_number_event_mouseover_payload_boolean_"] => {
    switch (value.event) {
        case "click":
            return "_event_click_payload_string_";
        case "scroll":
            return "_event_scroll_payload_number_";
        case "mouseover":
            return "_event_mouseover_payload_boolean_";
        default:
            throw new Error(`Unknown event`);
    }
};
