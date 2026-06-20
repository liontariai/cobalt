export async function* Subscription() {
    try {
        let i = 0;
        while (true) {
            yield "Hello " + (i++).toString();
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } finally {
        console.log("TRIGGGERED FINALLY IN SUBSCRIPTION");
    }
}
