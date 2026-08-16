export function Query() {
    return "qs-query";
}

export async function* Subscription() {
    yield "qs-sub";
}
