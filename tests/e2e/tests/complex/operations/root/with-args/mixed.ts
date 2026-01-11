export function Query(arg1: string, arg2: number, arg3: boolean, arg4: string[]) {
    return {
        scalar: arg1,
        list: [arg2, arg2, arg2],
        nested: {
            value: arg3,
            items: arg4,
        },
    };
}
