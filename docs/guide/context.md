# Context Factory

The context factory is a core concept in Cobalt that provides shared data and services to all your operations.

## What is Context?

Context is an object created for each request that contains:
- Request headers
- Database connections
- Authentication state
- PubSub instances
- Any other shared resources

## Creating the Context Factory

Create a file `server/ctx.ts` with a default export:

```typescript
// server/ctx.ts
export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        // Add your context properties here
    };
}
```

## Basic Example

```typescript
// server/ctx.ts
export default async function ({ headers }: CobaltCtxInput) {
    const userId = headers.get("X-User-Id");
    
    return {
        headers,
        userId,
        isAuthenticated: !!userId
    };
}
```

## With Database Connection

Using Prisma:

```typescript
// server/ctx.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        prisma
    };
}
```

Using PGlite (embedded PostgreSQL):

```typescript
// server/ctx.ts
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "../prisma/generated/client/client";

const client = new PGlite(process.env.DATABASE_URL!);
const adapter = new PrismaPGlite(client);
const prisma = new PrismaClient({ adapter });

export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        prisma
    };
}
```

## With PubSub for Subscriptions

```typescript
// server/ctx.ts
import { PubSub } from "./util/PubSub";

// Create pub/sub instances outside the function (singleton)
const pubSubMessages = new PubSub<Message>();
const pubSubNotifications = new PubSub<Notification>();

export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        pubsub: {
            messages: pubSubMessages,
            notifications: pubSubNotifications
        }
    };
}
```

## Accessing Context in Operations

Use the `$$ctx` helper function:

```typescript
export function Query() {
    const { headers, prisma, userId } = $$ctx(this);
    
    // Use context values
    return prisma.user.findUnique({
        where: { id: userId }
    });
}
```

The context is fully typed based on your context factory return type.

## Complete Example

```typescript
// server/ctx.ts
import dotenv from "dotenv";
dotenv.config();

import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient, type Todo } from "../prisma/generated/client/client";
import { PubSub } from "./util/PubSub";

// Initialize database
const client = new PGlite(process.env.DATABASE_URL!);
const adapter = new PrismaPGlite(client);

// Create pub/sub instances
const pubSubTodos = new PubSub<Todo>();
const prisma = new PrismaClient({ adapter });

export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        prisma,
        pubsub: {
            todos: pubSubTodos,
        },
    };
}
```

## Using in Operations

```typescript
// server/operations/todos.ts
export async function Query(search?: string) {
    const { prisma } = $$ctx(this);
    
    return prisma.todo.findMany({
        where: search ? {
            text: { contains: search }
        } : undefined
    });
}
```

```typescript
// server/operations/createTodo.ts
export async function Mutation(text: string) {
    const { prisma, pubsub } = $$ctx(this);
    
    const todo = await prisma.todo.create({
        data: { text, completed: false }
    });
    
    // Notify subscribers
    pubsub.todos.publish("new-todo", todo);
    
    return todo;
}
```

## Best Practices

### 1. Keep Context Lean

Only include what you need:

```typescript
// ✅ Good - focused context
export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        prisma,
        pubsub
    };
}

// ❌ Avoid - too much in context
export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        prisma,
        redis,
        elasticsearch,
        stripe,
        sendgrid,
        // ... 20 more services
    };
}
```

### 2. Reuse Connections

Initialize expensive resources outside the function:

```typescript
// ✅ Good - reused connection
const prisma = new PrismaClient();

export default async function ({ headers }: CobaltCtxInput) {
    return { headers, prisma };
}

// ❌ Avoid - new connection per request
export default async function ({ headers }: CobaltCtxInput) {
    const prisma = new PrismaClient();  // Don't do this!
    return { headers, prisma };
}
```

### 3. Type Your Context

Let TypeScript infer the types:

```typescript
// The return type is automatically inferred
export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        prisma,
        userId: headers.get("X-User-Id") ?? null
    };
}
// Context type is: { headers: Headers; prisma: PrismaClient; userId: string | null }
```

### 4. Handle Errors Gracefully

```typescript
export default async function ({ headers }: CobaltCtxInput) {
    let userId: string | null = null;
    
    try {
        const token = headers.get("Authorization");
        if (token) {
            userId = await verifyToken(token);
        }
    } catch (error) {
        console.error("Token verification failed:", error);
    }
    
    return {
        headers,
        prisma,
        userId
    };
}
```

## Next Steps

- [Cobalt Auth](/guide/auth) — Add authentication
- [Operations](/guide/operations) — Use context in operations
- [Subscriptions](/guide/subscriptions) — Use PubSub for real-time
