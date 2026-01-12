export function Query(arg: { event: "click"; payload: string } | { event: "scroll"; payload: number } | { event: "mouseover"; payload: boolean }) {
    return {
        value: arg,
    };
}
