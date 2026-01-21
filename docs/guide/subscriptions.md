# Subscriptions

Subscriptions provide real-time updates to clients using GraphQL subscriptions over Server-Sent Events (SSE).

## Basic Subscription

Export an async generator function named `Subscription`:

```typescript
// server/operations/countdown.ts
export async function* Subscription() {
    for (let i = 10; i > 0; i--) {
        yield i;
        await sleep(1000);
    }
    yield "Blast off!";
}
```

Usage:
```typescript
for await (const value of await sdk.subscription.countdown) {
    console.log(value);  // 10, 9, 8, ... "Blast off!"
}
```

## Subscriptions with Arguments

```typescript
// server/operations/messages.ts
export async function* Subscription(channelId: string) {
    const { pubsub } = $$ctx(this);
    
    for await (const message of pubsub.subscribe(`channel:${channelId}`)) {
        yield message;
    }
}
```

Usage:
```typescript
for await (const message of await sdk.subscription.messages({ 
    channelId: "general" 
})) {
    console.log(message);
}
```

## PubSub Pattern

The most common pattern uses a pub/sub system:

### 1. Set Up PubSub in Context

```typescript
// server/ctx.ts
import { PubSub } from "./util/PubSub";

const pubSubMessages = new PubSub<Message>();

export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        pubsub: {
            messages: pubSubMessages
        }
    };
}
```

### 2. Publish from Mutations

```typescript
// server/operations/sendMessage.ts
export async function Mutation(text: string, channelId: string) {
    const { prisma, pubsub } = $$ctx(this);
    const { token } = $$auth(this);
    
    const message = await prisma.message.create({
        data: {
            text,
            channelId,
            authorId: token.subject.properties.id
        }
    });
    
    // Publish to subscribers
    pubsub.messages.publish(`channel:${channelId}`, message);
    
    return message;
}
```

### 3. Subscribe in Subscription

```typescript
// server/operations/onMessage.ts
export async function* Subscription(channelId: string) {
    const { pubsub } = $$ctx(this);
    
    for await (const message of await pubsub.messages.asyncIterator(
        `channel:${channelId}`
    )) {
        yield message;
    }
}
```

## Simple PubSub Implementation

Here's a basic PubSub implementation:

```typescript
// server/util/PubSub.ts
export class PubSub<T> {
    private subscribers = new Map<string, Set<(value: T) => void>>();

    publish(topic: string, value: T) {
        const subs = this.subscribers.get(topic);
        if (subs) {
            subs.forEach(callback => callback(value));
        }
    }

    async *asyncIterator(topic: string): AsyncGenerator<T> {
        const queue: T[] = [];
        let resolve: (() => void) | null = null;

        const callback = (value: T) => {
            queue.push(value);
            if (resolve) {
                resolve();
                resolve = null;
            }
        };

        // Subscribe
        if (!this.subscribers.has(topic)) {
            this.subscribers.set(topic, new Set());
        }
        this.subscribers.get(topic)!.add(callback);

        try {
            while (true) {
                if (queue.length > 0) {
                    yield queue.shift()!;
                } else {
                    await new Promise<void>(r => { resolve = r; });
                }
            }
        } finally {
            // Cleanup on disconnect
            this.subscribers.get(topic)?.delete(callback);
        }
    }
}
```

## Filtering Events

Filter events before yielding:

```typescript
export async function* Subscription(userId: string) {
    const { pubsub } = $$ctx(this);
    
    for await (const notification of pubsub.notifications.asyncIterator("all")) {
        // Only yield notifications for this user
        if (notification.targetUserId === userId) {
            yield notification;
        }
    }
}
```

## Authenticated Subscriptions

Protect subscriptions with authentication:

```typescript
export async function* Subscription() {
    const { pubsub } = $$ctx(this);
    const { token } = $$auth(this);
    const userId = token.subject.properties.id;
    
    for await (const todo of await pubsub.todos.asyncIterator("todos")) {
        // Only stream todos from other users
        if (todo.ownerId !== userId) {
            yield {
                id: todo.id,
                text: todo.text,
                completed: todo.completed,
                createdAt: todo.createdAt,
                by: todo.ownerId
            };
        }
    }
}
```

## Using Subscriptions in Frontend

### Basic Usage

```typescript
// Subscribe to updates
const subscription = await sdk.subscription.onMessage({ channelId: "general" });

for await (const message of subscription) {
    console.log("New message:", message);
}
```

### With React Hook

```typescript
// hooks/useAsyncIterable.ts
import { useEffect, useRef } from "react";

export function useAsyncIterable<T>(
    getIterable: () => Promise<AsyncIterable<T>>,
    onValue: (value: T) => void,
    onComplete: () => void
) {
    const iteratorRef = useRef<AsyncIterator<T> | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const iterable = await getIterable();
            iteratorRef.current = iterable[Symbol.asyncIterator]();

            while (!cancelled) {
                const { value, done } = await iteratorRef.current.next();
                if (done || cancelled) break;
                onValue(value);
            }

            if (!cancelled) onComplete();
        })();

        return () => {
            cancelled = true;
        };
    }, []);
}
```

### Using the Hook

```typescript
function MessageList({ channelId }) {
    const [messages, setMessages] = useState<Message[]>([]);

    useAsyncIterable(
        async () => await sdk.subscription.onMessage({ channelId }),
        (message) => {
            setMessages(prev => [...prev, message]);
        },
        () => {
            console.log("Subscription ended");
        }
    );

    return (
        <ul>
            {messages.map(m => <li key={m.id}>{m.text}</li>)}
        </ul>
    );
}
```

## The `$lazy` Pattern for Subscriptions

Create reusable subscription functions:

```typescript
import sdk, { _ } from "sdk";

const streamTodos = sdk.subscription.streamTodos(_)().$lazy;

// Later, start the subscription
const subscription = await streamTodos({ where: {} });

for await (const todo of subscription) {
    console.log("New todo:", todo);
}
```

## Real-World Example

From the Todo app:

```typescript
// server/operations/streamTodos.ts
import { Prisma } from "../../prisma/generated/client/client";

export async function* Subscription(where: Prisma.TodoWhereInput) {
    const { pubsub } = $$ctx(this);
    const { token } = $$auth(this);
    const email = token.subject.properties.email;

    for await (const todo of await pubsub.todos.asyncIterator("todos")) {
        // Only stream todos from other users
        if (todo.ownerId !== email) {
            yield {
                id: todo.id,
                text: todo.text,
                completed: todo.completed,
                createdAt: todo.createdAt,
                by: todo.ownerId,
            };
        }
    }
}
```

Frontend component:
```typescript
// components/TodoList.tsx

const streamTodos = sdk.subscription.streamTodos(_)().$lazy;

function TodoList() {
    const [streamedTodos, setStreamedTodos] = useState<Todo[]>([]);
    
    useAsyncIterable(
        async () => await streamTodos({ where: {} }),
        (todo) => {
            setStreamedTodos(t => [...t, todo]);
        },
        () => {}
    );

    // Combine with fetched todos
    const allTodos = [...fetchedTodos, ...streamedTodos];
    
    return (
        <ul>
            {allTodos.map(todo => <TodoItem key={todo.id} todo={todo} />)}
        </ul>
    );
}
```

## Best Practices

### 1. Clean Up Resources

Always handle cleanup when clients disconnect:

```typescript
export async function* Subscription() {
    try {
        for await (const event of eventStream) {
            yield event;
        }
    } finally {
        // Cleanup when client disconnects
        console.log("Client disconnected");
    }
}
```

### 2. Handle Backpressure

Don't flood clients with too many events:

```typescript
export async function* Subscription() {
    let lastYield = 0;
    const minInterval = 100; // ms
    
    for await (const event of fastEventStream) {
        const now = Date.now();
        if (now - lastYield >= minInterval) {
            yield event;
            lastYield = now;
        }
    }
}
```

### 3. Include Relevant Data

Yield complete, usable objects:

```typescript
export async function* Subscription() {
    for await (const event of pubsub.events) {
        // Include all data the client needs
        yield {
            id: event.id,
            type: event.type,
            data: event.data,
            timestamp: event.createdAt,
            actor: event.user
        };
    }
}
```

## Next Steps

- [Context Factory](/guide/context) — Set up PubSub in context
- [SDK Usage](/guide/sdk) — Using subscriptions with the SDK
- [Frontend Integration](/guide/frontend-integration) — React integration
