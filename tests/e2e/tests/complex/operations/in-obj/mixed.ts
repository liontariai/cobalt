export function Query() {
    return {
        result: {
            scalar: "Hello, World!",
            list: [1, 2, 3],
            nested: {
                value: "nested",
                items: ["a", "b", "c"],
            },
        },
    };
}
