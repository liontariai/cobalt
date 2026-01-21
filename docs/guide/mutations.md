# Mutations

Mutations are used to create, update, or delete data. They are the GraphQL equivalent of POST, PUT, PATCH, and DELETE requests in REST.

## Basic Mutation

Export a function named `Mutation` to create a GraphQL mutation:

```typescript
// server/operations/createMessage.ts
export function Mutation(text: string) {
    return {
        id: generateId(),
        text,
        createdAt: new Date()
    };
}
```

Usage:
```typescript
const message = await sdk.mutation.createMessage({ text: "Hello!" })();
// => {
//     id: "abc123",
//     text: "Hello!",
//     createdAt: Date("2026-01-01T00:00:00.000Z")
// }
//     ^ createdAt is already a Date object because of lazy custom scalar deserialization

```

## Create Operations

```typescript
// server/operations/createUser.ts
type CreateUserInput = {
    name: string;
    email: string;
    password: string;
};

export async function Mutation(data: CreateUserInput) {
    const { prisma } = $$ctx(this);
    
    const user = await prisma.user.create({
        data: {
            name: data.name,
            email: data.email,
            passwordHash: await hashPassword(data.password)
        }
    });
    
    return {
        id: user.id,
        name: user.name,
        email: user.email
    };
}

export const __typename = "User";
```

## Update Operations

```typescript
// server/operations/updateUser.ts
type UpdateUserInput = {
    name?: string;
    email?: string;
};

export async function Mutation(id: string, data: UpdateUserInput) {
    const { prisma } = $$ctx(this);
    
    const user = await prisma.user.update({
        where: { id },
        data
    });
    
    return user;
}

export const __typename = "User";
```

Usage:
```typescript
const updated = await sdk.mutation.updateUser({
    id: "user-123",
    data: { name: "New Name" }
})();
```

## Delete Operations

```typescript
// server/operations/deleteUser.ts
export async function Mutation(id: string) {
    const { prisma } = $$ctx(this);
    
    await prisma.user.delete({
        where: { id }
    });
    
    return { success: true, deletedId: id };
}
```

## Mutations with Complex Types

Handle complex nested inputs:

```typescript
type CreatePostInput = {
    title: string;
    content: string;
    tags: string[];
    metadata?: {
        featured: boolean;
        publishAt?: string;
    };
};

export async function Mutation(data: CreatePostInput) {
    const { headers, prisma } = $$ctx(this);
    
    return prisma.post.create({
        data: {
            ...data,
            authorId: headers.get("X-User-Id")
        }
    });
}
```

## Authenticated Mutations

Protect mutations with authentication:

```typescript
// server/operations/createTodo.ts
import { Prisma } from "../../prisma/generated/client/client";

export async function Mutation(
    data: Omit<Prisma.TodoCreateInput, "ownerId">
) {
    const { prisma, pubsub } = $$ctx(this);
    const { token } = $$auth(this);
    const email = token.subject.properties.email;

    const todo = await prisma.todo.create({
        data: {
            ...data,
            ownerId: email,
        },
    });

    // Notify subscribers
    pubsub.todos.publish("todos", todo);

    return todo;
}
```

## Validation

Validate input data before processing:

```typescript
export function Mutation(email: string, password: string) {
    // Validate email
    if (!isValidEmail(email)) {
        throw new Error("Invalid email format");
    }
    
    // Validate password strength
    if (password.length < 8) {
        throw new Error("Password must be at least 8 characters");
    }
    
    // Process the mutation
    return createUser(email, password);
}
```

## Transactions

Use database transactions for complex operations:

```typescript
export async function Mutation(fromId: string, toId: string, amount: number) {
    const { prisma } = $$ctx(this);
    
    // Use a transaction to ensure both operations succeed or fail together
    const result = await prisma.$transaction(async (tx) => {
        // Deduct from sender
        await tx.account.update({
            where: { id: fromId },
            data: { balance: { decrement: amount } }
        });
        
        // Add to receiver
        await tx.account.update({
            where: { id: toId },
            data: { balance: { increment: amount } }
        });
        
        return { success: true, amount };
    });
    
    return result;
}
```

## Publishing Events

Publish events for subscriptions:

```typescript
export async function Mutation(data: CreateMessageInput) {
    const { prisma, pubsub } = $$ctx(this);
    
    const message = await prisma.message.create({ data });
    
    // Publish to subscribers
    pubsub.messages.publish("new-message", message);
    
    return message;
}
```

## The `$lazy` Pattern for Mutations

Create reusable mutation functions:

```typescript
import sdk, { _ } from "sdk";

// Create a lazy mutation
const createTodo = sdk.mutation.createOneTodo(_)().$lazy;

// Use it multiple times
await createTodo({ data: { text: "Task 1", completed: false } });
await createTodo({ data: { text: "Task 2", completed: false } });
```

## Real-World Example

From the Todo app - update a todo:

```typescript
// server/operations/updateOneTodo.ts
import { Prisma } from "../../prisma/generated/client/client";

export async function Mutation(
    where: Omit<Prisma.TodoWhereUniqueInput, "AND" | "OR" | "NOT" | "ownerId">,
    data: Omit<Prisma.TodoUpdateInput, "ownerId">
) {
    const { prisma } = $$ctx(this);
    const { token } = $$auth(this);
    const email = token.subject.properties.email;

    const todo = await prisma.todo.update({
        where: {
            ...where,
            ownerId: email,  // Ensure user can only update their own todos
        },
        data,
    });

    return todo;
}

export const __typename = "Todo";
```

Frontend usage:
```typescript
// Define the lazy mutation
const updateTodo = sdk.mutation.updateOneTodo(_)().$lazy;

// Toggle completion
const toggleComplete = async (todo) => {
    await updateTodo({
        where: { id: todo.id },
        data: { completed: !todo.completed }
    });
};
```

## Return Types

Mutations should return useful data:

```typescript
// Return the created/updated entity
export function Mutation(data: CreateInput) {
    const created = database.create(data);
    return created;  // ✅ Return the full entity
}

// Return success status with details
export function Mutation(id: string) {
    database.delete(id);
    return { 
        success: true, 
        deletedId: id,
        deletedAt: new Date()
    };
}
```

## Error Handling

Handle errors appropriately:

```typescript
export async function Mutation(id: string, data: UpdateInput) {
    const { prisma } = $$ctx(this);
    
    // Check existence
    const existing = await prisma.item.findUnique({ where: { id } });
    if (!existing) {
        throw new Error(`Item ${id} not found`);
    }
    
    // Check permissions
    const { token } = $$auth(this);
    if (existing.ownerId !== token.subject.properties.id) {
        throw new Error("Not authorized to update this item");
    }
    
    // Perform update
    return prisma.item.update({
        where: { id },
        data
    });
}
```

## Next Steps

- [Subscriptions](/guide/subscriptions) — Real-time updates
- [Context Factory](/guide/context) — Access shared resources
- [The $lazy Pattern](/guide/lazy-pattern) — Reusable mutation functions
