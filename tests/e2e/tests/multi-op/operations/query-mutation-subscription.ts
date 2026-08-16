export function Query() {
    return "qms-query";
}

export function Mutation() {
    return "qms-mutation";
}

export async function* Subscription() {
    yield "qms-sub";
}
