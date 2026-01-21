# Magic Helper Functions

Cobalt provides "magic" helper functions that are globally available: 

- `$$ctx(this)`
- `$$auth(this)`
- `$$root.[TypeName](this)`

This guide explains how they work under the hood.

## Overview

These helpers are globally defined via the `@cobalt27/runtime` package.

For the types to be available, you have to import the `@cobalt27/runtime` package in your `tsconfig.json`. When you run `bunx @cobalt27/dev init`, your `tsconfig.json` is automatically configured to make these helpers available.

In order for Typescript to provide the right types, you'll have to have path aliases configured in your `tsconfig.json`.

The `$$ctx` path alias must point to your `ctx.ts` file.

The `$$types` path alias must point to your `.cobalt/$$types` directory.

For convenience, Cobalt also adds a `sdk` path alias to your `tsconfig.json` that points to your `.cobalt/sdk.ts` file.

```json
// tsconfig.json
{
  "compilerOptions": {
    "types": ["@cobalt27/runtime"],
    "paths": {
      "$$ctx": ["./server/ctx.ts"],
      "$$types": ["./.cobalt/$$types"],
      "sdk": ["./.cobalt/sdk.ts"]
    },
    "noImplicitThis": false
  }
}
```

## Available Helpers

### `$$ctx`

Access the GraphQL context in your operations:

```typescript
export function Query() {
    const { prisma, headers } = $$ctx(this);
    // ...
}
```

### `$$auth`

Access authentication information (when using Cobalt Auth):

```typescript
export function Query() {
    const { token } = $$auth(this);
    const { email } = token.subject.properties;
    // ...
}
```

### `$$root.TypeName`

Access the root object when extending types with field resolvers.

```typescript
// server/types/User.ts
export function email() {
    const { name } = $$root.User(this);
    return `${name}@example.com`;
}
```

## How It Works

### TypeScript Path Aliases

When you initialize a Cobalt project, your `tsconfig.json` is updated with path aliases that map these helper names to the files in your project:

```json
{
  "compilerOptions": {
    "types": ["@cobalt27/runtime"],
    "paths": {
      "$$ctx": ["./server/ctx.ts"],
      "$$types": ["./.cobalt/$$types"]
    },
    "noImplicitThis": false
  }
}
```

### The `@cobalt27/runtime` Package

The `@cobalt27/runtime` package provides the type definitions and runtime implementations for these helpers. The helpers are:

1. **Type-safe** - Full TypeScript autocomplete and type checking
2. **Context-aware** - They use the `this` parameter to access the GraphQL resolver context
3. **Automatically available** - No imports needed thanks to path aliases

### The `this` Parameter

The `this` parameter is crucial. It provides the GraphQL resolver context, which includes:

- The context object (from your `ctx.ts`)
- The parent object (for field resolvers)
- The GraphQL info object

By passing `this`, the helpers can access all the necessary runtime information.

For TypesScript to not complain about the `this` parameter, you have to set the `noImplicitThis` compiler option to `false` in your `tsconfig.json`.

```json
{
  "compilerOptions": {
    "noImplicitThis": false
  }
}
```

## TypeScript Configuration

### Automatic Setup

When you run `bunx @cobalt27/dev init`, the following happens:

1. **Path aliases are added** to `tsconfig.json`:
   ```json
   {
     "compilerOptions": {
       "types": ["@cobalt27/runtime"],
       "paths": {
         "$$ctx": ["./server/ctx.ts"],
         "$$types": ["./.cobalt/$$types"]
       },
       "noImplicitThis": false
     }
   }
   ```

2. **Runtime types are installed** via `@cobalt27/runtime` package

3. **SDK path alias is configured**:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "sdk": ["./.cobalt/sdk.ts"]
       }
     }
   }
   ```

### Manual Configuration

If you need to set this up manually, add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@cobalt27/runtime"],
    "paths": {
      "$$ctx": ["./server/ctx.ts"],
      "$$types": ["./.cobalt/$$types"],
      "sdk": ["./.cobalt/sdk.ts"]
    },
    "noImplicitThis": false
  }
}
```

## Understanding Each Helper

### `$$ctx`

**Type Definition:**
```typescript
declare function $$ctx(this: GraphQLResolverContext): YourContextType;
```

**How it works:**
- Returns the context object from your `ctx.ts` file
- Fully typed based on your context factory return type

**Example:**
```typescript
// server/ctx.ts
export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        prisma: new PrismaClient(),
        userId: headers.get("X-User-Id")
    };
}

// server/operations/user.ts
export function Query() {
    // TypeScript knows the exact shape of context
    const { prisma, userId } = $$ctx(this);
    // prisma: PrismaClient
    // userId: string | null
}
```

### `$$auth`

**Type Definition:**
```typescript
declare function $$auth(this: GraphQLResolverContext): AuthContext;
```

**How it works:**
- Accesses authentication state from the resolver context
- Only available when Cobalt Auth is configured
- Provides token information and auth SDK methods

**Example:**
```typescript
export function Query() {
    const { token } = $$auth(this);
    // token is fully typed based on your auth.ts configuration
    
    const { email, id } = token.subject.properties;
    // email and id are typed based on your token definition
}
```

### `$$root.TypeName`

**Type Definition:**
```typescript
declare namespace $$root {
    function TypeName(this: GraphQLFieldResolverContext): TypeNameType;
}
```

**How it works:**
- Accesses the parent object in field resolvers
- Used in `server/types/<TypeName>.ts` files
- Provides typed access to the parent object's fields

**Example:**
```typescript
// server/operations/user.ts
export function Query() {
    return { id: "1", name: "John" };
}
export const __typename = "User";

// server/types/User.ts
export function email() {
    // $$root.User(this) gives you access to the User object
    const { name } = $$root.User(this);
    // name is typed as string (from the User type)
    
    return `${name}@example.com`;
}
```

<!-- ### `$$types`

**Type Definition:**
```typescript
// Generated in .types/*.$$types files
export namespace $$types {
    namespace Unions {
        type UnionName = /* union type */;
    }
    namespace UnionsResolveToTypename {
        type UnionName = /* typename string */;
    }
}
```

**How it works:**
- Generated type definitions for union types
- Used in `resolveType` functions for unions
- Provides type safety for union discrimination

**Example:**
```typescript
// server/operations/search.ts
type SearchResult = User | Post;

export function Query(): SearchResult {
    return { /* ... */ };
}

// Cobalt generates types in .types/search.$$types
// You use them in resolveType:
Query.resolveType = (
    value: import("$$types").Unions["SearchResultUnion"]
): import("$$types").UnionsResolveToTypename["SearchResultUnion"] => {
    if ("email" in value) return "User";
    return "Post";
};
``` -->

## Why `this` is Required

The `this` parameter is essential because:

1. **GraphQL Resolver Context** - It provides access to the resolver's execution context
2. **Runtime Access** - The helpers need runtime access to context, parent, and info objects

**Without `this`:**
```typescript
// ❌ This won't work - no context available
export function Query() {
    const { prisma } = $$ctx();  // Error: Missing context
}
```

**With `this`:**
```typescript
// ✅ Correct - context is available via `this`
export function Query() {
    const { prisma } = $$ctx(this);  // Works!
}
```

## Type Inference

The helpers provide full type inference:

### Context Types

```typescript
// Your context factory determines the type
export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        db: new Database(),
        cache: new Cache()
    };
}

// $$ctx(this) automatically knows the return type
export function Query() {
    const context = $$ctx(this);
    // context: { headers: Headers; db: Database; cache: Cache }
    
    // Full autocomplete and type checking
    context.db.query(/* ... */);
    context.cache.get(/* ... */);
}
```

### Auth Types

```typescript
// Your auth.ts configuration determines token types
tokens: {
    user: {
        id: string();
        email: string();
        role: string();
    }
}

// $$auth(this) knows the exact token shape
export function Query() {
    const { token } = $$auth(this);
    // token.subject.properties: { id: string; email: string; role: string }
    
    const { id, email, role } = token.subject.properties;
    // All fully typed!
}
```

### Root Types

```typescript
// server/operations/user.ts
// The __typename determines the root type
export const __typename = "User";

// server/types/User.ts
// $$root.User(this) knows the User type structure
export function email() {
    const user = $$root.User(this);
    // user: { id: string; name: string; ... }
    
    return `${user.name}@example.com`;
}
```

## Common Patterns

### Combining Helpers

```typescript
export async function Query(id: string) {
    const { prisma } = $$ctx(this);
    const { token } = $$auth(this);
    const ownerId = token.subject.properties.id;
    
    // Use both context and auth
    return prisma.todo.findUnique({
        where: {
            id,
            ownerId
        }
    });
}
```

### Conditional Auth

```typescript
export function Query() {
    const { headers } = $$ctx(this);
    
    // Check if auth is available
    try {
        const { token } = $$auth(this);
        return { authenticated: true, userId: token.subject.properties.id };
    } catch {
        return { authenticated: false };
    }
}
```

### Type Extensions

```typescript
// server/types/Todo.ts
export function isOverdue() {
    const { dueDate } = $$root.Todo(this);
    return new Date() > new Date(dueDate);
}

export function owner() {
    const { ownerId } = $$root.Todo(this);
    const { prisma } = $$ctx(this);
    return prisma.user.findUnique({ where: { id: ownerId } });
}
```

## Troubleshooting

### "Cannot find name '$$ctx'"

**Problem:** TypeScript doesn't recognize the helper.

**Solution:** Ensure your `tsconfig.json` has the path aliases configured. Run `bunx @cobalt27/dev init` to set it up automatically.

### "Property 'X' does not exist on type"

**Problem:** Type inference isn't working correctly.

**Solution:** 
1. Ensure your `ctx.ts` has a default export
2. Check that `@cobalt27/runtime` is installed
3. Restart your TypeScript server

### "Cannot read property of undefined"

**Problem:** Using helper without `this`.

**Solution:** Always pass `this` as the parameter:
```typescript
// ❌ Wrong
const ctx = $$ctx();

// ✅ Correct
const ctx = $$ctx(this);
```

## Next Steps

- [Context Factory](/guide/context) — Configure your context
- [Cobalt Auth](/guide/auth) — Set up authentication
- [Types & Schemas](/guide/types) — Extended types with `$$root`
- [API Reference: Context Helpers](/api/context-helpers) — Detailed API documentation
