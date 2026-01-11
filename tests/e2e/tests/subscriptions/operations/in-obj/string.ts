export async function* Subscription() {
    yield { message: "Hello" };
    yield { message: "World" };
    // yield { message: "!" };
}
