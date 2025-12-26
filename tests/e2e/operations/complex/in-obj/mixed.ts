export function Query(arg: string) {
    return {
        result: {
            scalar: arg,
            list: [1, 2, 3],
            nested: {
                value: "nested",
                items: ["a", "b", "c"],
            },
        },
    };
}

