export function Query(arg: string) {
    return {
        user: {
            name: arg,
            address: {
                street: "123 Main St",
                city: "New York",
            },
        },
    };
}

