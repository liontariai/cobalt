# Queries

Queries are used to read data from your API. They are the GraphQL equivalent of GET requests in REST.

## Basic Query

Export a function named `Query` to create a GraphQL query:

```typescript
// server/operations/hello.ts
export function Query() {
    return "Hello, World!";
}
```

Usage:
```typescript
const result = await sdk.query.hello;
// => "Hello, World!"
```

## Query with Arguments

Add parameters to accept arguments:

```typescript
// server/operations/greet.ts
export function Query(name: string) {
    return `Hello, ${name}!`;
}
```

Usage:
```typescript
const result = await sdk.query.greet({ name: "Alice" });
// => "Hello, Alice!"
```

## Multiple Arguments

```typescript
// server/operations/search.ts
export function Query(
    term: string,
    limit: number = 10,
    offset: number = 0
) {
    return database.search(term, { limit, offset });
}
```

Usage:
```typescript
const results = await sdk.query.search({
    term: "typescript",
    limit: 20,
    offset: 0
})();
```

## Optional Arguments

Use TypeScript optional parameters or union with `undefined`:

```typescript
// server/operations/optional.ts
export function Query(
    required: string,
    optional?: string,
    alsoOptional: string | undefined
) {
    return { required, optional, alsoOptional };
}
```

Usage:
```typescript
const results = await sdk.query.optional({
    required: "required",
    optional: "optional",
    alsoOptional: undefined
})();
// => { required: "required", optional: "optional", alsoOptional: undefined }
```

## Complex Input Types

Define input types using TypeScript:

```typescript
type UserFilter = {
    name?: string;
    email?: string;
    role?: "admin" | "user";
    createdAfter?: Date;
};

export function Query(filter: UserFilter) {
    return database.users.findMany({
        where: filter
    });
}
```

Usage:
```typescript
const users = await sdk.query.users({
    filter: {
        role: "admin",
        createdAfter: new Date("2026-01-01")
    }
})();
```

## Returning Objects

Return objects to create complex GraphQL types:

```typescript
// server/operations/user.ts
export function Query(id: string) {
    return {
        id,
        name: "John Doe",
        email: "john@example.com",
        profile: {
            avatar: "https://...",
            bio: "Developer"
        }
    };
}

export const __typename = "User";
```

The SDK provides full type safety:
```typescript
const user = await sdk.query.user({ id: "1" })();

console.log(user.name);           // ✅ Typed as string
console.log(user.profile.avatar); // ✅ Nested access
```

## Returning Lists

```typescript
// server/operations/users.ts
export function Query() {
    return [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
        { id: "3", name: "Charlie" }
    ];
}
```

Usage:
```typescript
const users = await sdk.query.users();

users.forEach(user => {
    console.log(user.name);
});
```

## Async Queries

Queries can be async for database operations:

```typescript
export async function Query(id: string) {
    const { prisma } = $$ctx(this);
    
    const user = await prisma.user.findUnique({
        where: { id }
    });
    
    if (!user) {
        throw new Error(`User ${id} not found`);
    }
    
    return user;
}
```

## Using Context

Access shared resources through context:

```typescript
export async function Query(search?: string) {
    const { prisma } = $$ctx(this);
    
    return prisma.user.findMany({
        where: search ? {
            name: { contains: search }
        } : undefined
    });
}
```

## Authenticated Queries

Protect queries with authentication:

```typescript
export function Query() {
    const { token } = $$auth(this);
    const { email } = token.subject.properties;
    
    // Return only data for the authenticated user
    return database.getUserData(email);
}
```

## Field Selection

With the generated SDK, you can select specific fields:

```typescript
// Select all fields
const user = await sdk.query.user({ id: "1" })();

// Select specific fields using a selector function
const userPartial = await sdk.query.user({ id: "1" })(
    ({ id, name }) => ({ id, name })
);
```

## The `$lazy` Pattern

Create reusable query functions:

```typescript
import sdk, { _ } from "sdk";

// Create a lazy query with a placeholder
const getUser = sdk.query.user({ id: _ })().$lazy;

// Call it later with actual values
const user1 = await getUser({ id: "1" });
const user2 = await getUser({ id: "2" });
```

This is especially useful for:
- React hooks
- Repeated calls with different parameters
- Testing

## Error Handling

Throw errors to return GraphQL errors:

```typescript
export async function Query(id: string) {
    const user = await database.findUser(id);
    
    if (!user) {
        throw new Error(`User not found: ${id}`);
    }
    
    return user;
}
```

## Examples from the Todo App

Here's a real-world example from the Todo app:

```typescript
// server/operations/todos.ts
import { Prisma } from "../../prisma/generated/client/client";

export async function Query(
    where?: Omit<Prisma.TodoWhereInput, "AND" | "OR" | "NOT" | "ownerId">
) {
    const { prisma } = $$ctx(this);
    const { token } = $$auth(this);
    const { email } = token.subject.properties;

    return (
        await prisma.todo.findMany({
            where: {
                ...where,
                ownerId: email,
            },
        })
    ).map((todo) => ({
        id: todo.id,
        text: todo.text,
        completed: todo.completed,
        createdAt: todo.createdAt,
        by: todo.ownerId,
    }));
}

export const __typename = "TodoWithBy";
```

Usage:
```typescript
const getTodos = sdk.query.todos(_)().$lazy;

// Later, in a component
const todos = await getTodos({
    where: {
        text: { contains: searchText }
    }
});
```

## Next Steps

- [Mutations](/guide/mutations) — Learn about modifying data
- [SDK Usage](/guide/sdk) — Master the generated SDK
- [The $lazy Pattern](/guide/lazy-pattern) — Reusable query functions
