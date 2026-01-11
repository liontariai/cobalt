export function Query() {
    return {
        scalar: "Hello, World!",
        list: [1, 2, 3],
        nested: {
            value: "nested",
            items: ["a", "b", "c"],
        },
    };
}
