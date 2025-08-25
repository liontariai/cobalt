export type Subscriber<T> = (data: T) => void;

export class PubSub<T> {
    private subscribers: Map<string, Subscriber<T>[]> = new Map();

    // Subscribe to an event
    subscribe(eventName: string, callback: Subscriber<T>): () => void {
        if (!this.subscribers.has(eventName)) {
            this.subscribers.set(eventName, []);
        }
        const eventSubscribers = this.subscribers.get(eventName)!;
        eventSubscribers.push(callback);

        // Return an unsubscribe function
        return () => {
            const updatedSubscribers = eventSubscribers.filter(
                (sub) => sub !== callback,
            );
            if (updatedSubscribers.length > 0) {
                this.subscribers.set(eventName, updatedSubscribers);
            } else {
                this.subscribers.delete(eventName);
            }
        };
    }

    // Publish an event to all subscribers
    publish(eventName: string, data: T): void {
        const eventSubscribers = this.subscribers.get(eventName) || [];
        eventSubscribers.forEach((callback) => callback(data));
    }

    // Async iterator for GraphQL subscriptions
    async *asyncIterator(eventName: string): AsyncIterableIterator<T> {
        const queue: T[] = [];
        let resolveNext: ((value: T) => void) | null = null;

        const unsubscribe = this.subscribe(eventName, (data: T) => {
            if (resolveNext) {
                resolveNext(data);
                resolveNext = null;
            } else {
                queue.push(data);
            }
        });

        try {
            while (true) {
                if (queue.length > 0) {
                    yield queue.shift()!;
                } else {
                    const data = await new Promise<T>((resolve) => {
                        resolveNext = resolve;
                    });
                    yield data;
                }
            }
        } finally {
            unsubscribe();
        }
    }
}
