# Context Helpers

Cobalt provides "magic" helper functions to access context and authentication in your operations. These helpers are made available through TypeScript path aliases and the `@cobalt27/runtime` package.

> **Note:** For a detailed explanation of how these helpers work, see the [Magic Helper Functions](/guide/magic-helpers) guide.

## `$$ctx`

Access the GraphQL context in any operation.

### Syntax

```typescript
const context = $$ctx(this);
```

### Usage

```typescript
export function Query() {
    const { headers, prisma, pubsub } = $$ctx(this);
    
    // Use context values
    const userId = headers.get("X-User-Id");
    
    return prisma.user.findUnique({
        where: { id: userId }
    });
}
```

### Return Type

The return type is inferred from your `ctx.ts` default export:

```typescript
// server/ctx.ts
export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        prisma,
        pubsub: {
            todos: pubSubTodos
        }
    };
}

// In operations, $$ctx(this) returns:
// {
//   headers: Headers;
//   prisma: PrismaClient;
//   pubsub: { todos: PubSub<Todo> };
// }
```

### Examples

#### Database Access

```typescript
export async function Query(id: string) {
    const { prisma } = $$ctx(this);
    
    return prisma.user.findUnique({
        where: { id }
    });
}
```

#### Header Access

```typescript
export function Query() {
    const { headers } = $$ctx(this);
    
    const userAgent = headers.get("User-Agent");
    const acceptLanguage = headers.get("Accept-Language");
    
    return { userAgent, acceptLanguage };
}
```

#### PubSub for Subscriptions

```typescript
export async function Mutation(text: string) {
    const { prisma, pubsub } = $$ctx(this);
    
    const todo = await prisma.todo.create({
        data: { text, completed: false }
    });
    
    pubsub.todos.publish("new-todo", todo);
    
    return todo;
}
```

---

## `$$auth`

Access authentication information when using Cobalt Auth.

### Syntax

```typescript
const auth = $$auth(this);
```

### Return Value

```typescript
{
    token: {
        type: string;           // Token type (e.g., "user")
        subject: {
            type: string;       // Subject type
            properties: {       // Token properties from auth.ts
                id: string;
                email: string;
                // ... other defined properties
            }
        }
    };
    query: AuthSDKQuery;       // Auth SDK query methods
    mutation: AuthSDKMutation; // Auth SDK mutation methods
}
```

### Usage

```typescript
export function Query() {
    const { token } = $$auth(this);
    const { id, email } = token.subject.properties;
    
    return {
        userId: id,
        userEmail: email
    };
}
```

### Examples

#### Get Current User

```typescript
export async function Query() {
    const { token } = $$auth(this);
    const { prisma } = $$ctx(this);
    
    const userId = token.subject.properties.id;
    
    return prisma.user.findUnique({
        where: { id: userId }
    });
}
```

#### Protect User Data

```typescript
export async function Query(id: string) {
    const { token } = $$auth(this);
    const { prisma } = $$ctx(this);
    
    const todo = await prisma.todo.findUnique({
        where: { id }
    });
    
    // Ensure user owns this todo
    if (todo?.ownerId !== token.subject.properties.id) {
        throw new Error("Not authorized");
    }
    
    return todo;
}
```

#### Admin Operations

```typescript
export async function Mutation(userId: string, data: UpdateUserInput) {
    const { mutation } = $$auth(this);
    
    // Use auth SDK for admin operations
    return mutation.adminUpdateUser({
        id: userId,
        data
    });
}
```

---

## `$$root`

Access root type resolvers for type extensions.

### Syntax

```typescript
const root = $$root.TypeName(this);
```

### Usage

Extend existing types with computed fields:

```typescript
// server/types/Todo.ts
export function extendedField() {
    const { id, text } = $$root.Todo(this);
    
    return `${id}-${text.toUpperCase()}`;
}
```

---

## Type Definitions

### `CobaltCtxInput`

The input type for context factory:

```typescript
type CobaltCtxInput = {
    headers: Headers;
};
```

### `CobaltCtxFactory`

The context factory function type:

```typescript
type CobaltCtxFactory = (
    input: CobaltCtxInput
) => Promise<YourContextType>;
```

## Best Practices

### 1. Destructure What You Need

```typescript
// ✅ Good - only destructure needed values
export function Query() {
    const { prisma } = $$ctx(this);
    return prisma.user.findMany();
}

// ❌ Avoid - unnecessary destructuring
export function Query() {
    const ctx = $$ctx(this);
    return ctx.prisma.user.findMany();
}
```

### 2. Always Use `this`

```typescript
// ✅ Correct
export function Query() {
    const { prisma } = $$ctx(this);
}

// ❌ Wrong - won't work
export function Query() {
    const { prisma } = $$ctx();  // Missing 'this'
}
```

### 3. Combine Helpers

```typescript
export async function Query() {
    const { prisma } = $$ctx(this);
    const { token } = $$auth(this);
    
    return prisma.todo.findMany({
        where: {
            ownerId: token.subject.properties.id
        }
    });
}
```

## How It Works

These helpers are global functions. They're made available through:

1. **TypeScript Path Aliases** - Configured in `tsconfig.json` during `bunx @cobalt27/dev init`
2. **@cobalt27/runtime Package** - Provides type definitions and runtime implementations
3. **The `this` Parameter** - Provides access to GraphQL resolver context

See the [Magic Helper Functions](/guide/magic-helpers) guide for a complete explanation.

## Next Steps

- [Magic Helper Functions](/guide/magic-helpers) — How the helpers work under the hood
- [Context Factory](/guide/context) — Configure your context
- [Cobalt Auth](/guide/auth) — Set up authentication
- [SDK Methods](/api/sdk-methods) — Generated SDK reference
