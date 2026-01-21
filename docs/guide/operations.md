# Operations Overview

In Cobalt, operations are the core building blocks of your API. They correspond to GraphQL's three operation types: **Queries**, **Mutations**, and **Subscriptions**.

## Operation Types

| Type | Purpose | Export | Execution |
|------|---------|--------|-----------|
| Query | Read data | `export function Query()` | Immediate |
| Mutation | Write/modify data | `export function Mutation()` | Immediate |
| Subscription | Real-time updates | `export async function* Subscription()` | Streaming |

## Defining Operations

### Basic Query

```typescript
// server/operations/greeting.ts
export function Query() {
    return "Hello, World!";
}
```

### Query with Arguments

```typescript
// server/operations/user.ts
export function Query(id: string) {
    return {
        id,
        name: "John Doe"
    };
}
```

### Async Operations

Operations can be async:

```typescript
export async function Query(id: string) {
    const user = await database.findUser(id);
    return user;
}
```

### Multiple Arguments

```typescript
export function Query(
    search: string,
    limit: number,
    offset: number
) {
    return database.search(search, { limit, offset });
}
```

### Complex Argument Types

Use TypeScript types for complex inputs:

```typescript
type CreateUserInput = {
    name: string;
    email: string;
    role?: "admin" | "user";
};

export function Mutation(data: CreateUserInput) {
    return database.createUser(data);
}
```

## Return Types

Cobalt infers GraphQL types from your TypeScript return types.

### Scalar Returns

```typescript
export function Query() {
    return "string";      // String!
}

export function Query() {
    return 42;            // Int!
}

export function Query() {
    return true;          // Boolean!
}

export function Query() {
    return 3.14;          // Float!
}
```

### Object Returns

```typescript
export function Query() {
    return {
        id: "1",
        name: "John",
        age: 30
    };
}
// Generates a new GraphQL type with id, name, age fields
```

### Array Returns

```typescript
export function Query() {
    return [
        { id: "1", name: "John" },
        { id: "2", name: "Jane" }
    ];
}
// Returns [UserType!]!
```

### Nullable Returns

```typescript
export function Query(): string | null {
    return null;
}
// Returns String (nullable)
```

## Custom Type Names

By default, Cobalt generates type names based on the operation. Override with `__typename`:

```typescript
export function Query() {
    return {
        id: "1",
        name: "John"
    };
}

export const __typename = "User";
```

## Accessing Context

Use the `$$ctx` helper to access the GraphQL context:

See [Magic Helper Functions](/guide/magic-helpers) for more details.

```typescript
export function Query() {
    const { headers, database } = $$ctx(this);
    
    const userId = headers.get("X-User-Id");
    return database.getUser(userId);
}
```

## Accessing Auth

When using Cobalt Auth, use the `$$auth` helper:

See [Magic Helper Functions](/guide/magic-helpers) for more details.

```typescript
export function Query() {
    const { token } = $$auth(this);
    const { email } = token.subject.properties;
    
    return { user: email };
}
```

## Operation Naming Convention

The GraphQL operation name is derived from the file path:

```
operations/users.ts           -> query { users }
operations/getUser.ts         -> query { getUser }
operations/posts/create.ts    -> mutation { postsCreate }
operations/posts/index.ts     -> query { posts }
```

## Best Practices

### 1. Keep Operations Focused

Each operation should do one thing well:

```typescript
// ✅ Good - focused operation
export function Query(id: string) {
    return findUserById(id);
}

// ❌ Avoid - too many responsibilities
export function Query(id?: string, email?: string, search?: string) {
    if (id) return findById(id);
    if (email) return findByEmail(email);
    return searchUsers(search);
}
```

### 2. Use Short Names

Use short names, you don't want to end up with long names like in tRPC or REST APIs.
After all, you'll have excelent autocomplete in the sdk and your argument names can contribute to your naming.

```typescript
// ✅ Good
// operations/user.ts
export function Query(id: string) { ... }

// operations/users.ts
export function Query(search: { name?: string, email?: string }) { ... }
```

### 3. Validate Inputs

```typescript
export function Mutation(email: string) {
    if (!isValidEmail(email)) {
        throw new Error("Invalid email format");
    }
    // ...
}
```

### 4. Handle Errors Gracefully

```typescript
export async function Query(id: string) {
    const user = await database.findUser(id);
    
    if (!user) {
        throw new Error(`User ${id} not found`);
    }
    
    return user;
}
```

## Next Steps

- [Queries](/guide/queries) — Deep dive into queries
- [Mutations](/guide/mutations) — Learn about mutations
- [Subscriptions](/guide/subscriptions) — Real-time data with subscriptions
