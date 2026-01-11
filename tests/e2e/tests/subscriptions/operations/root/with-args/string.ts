export async function* Subscription(message: string) {
    yield message;
    yield message;
}
