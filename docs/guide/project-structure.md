# Project Structure

Cobalt uses a file-based approach to define your GraphQL operations. Understanding the project structure is key to working effectively with Cobalt.

## Directory Layout

A typical Cobalt project looks like this:

```
my-app/
├── server/
│   ├── ctx.ts                    # Context factory (required)
│   ├── auth.ts                   # Auth configuration (optional)
│   ├── operations/               # Your operations (required)
│   │   ├── users.ts              # -> (query | mutation | subscription).users 
│   │   ├── posts/
│   │   │   └── index.ts          # -> (query | mutation | subscription).posts
│   │   └── comments/
│   │       ├── new.ts         # -> (query | mutation | subscription).commentsNew
│   │       └── list.ts           # -> (query | mutation | subscription).commentsList
│   └── types/                    # Extended GraphQL types (optional)
│       └── User.ts
├── prisma/                       # Database schema (optional)
│   └── schema.prisma
├── package.json
└── tsconfig.json
```

## Key Files

### `server/ctx.ts` - Context Factory

**Required.** This file exports a default async function that creates the GraphQL context:

```typescript
export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        // Database client, auth info, etc.
    };
}
```

### `server/auth.ts` - Authentication Config

**Optional.** Configure Cobalt Auth with OpenAuthJS:

See [Authentication](/guide/auth) for more information.

```typescript
import auth from "@cobalt27/auth";

export default {
    clientId: "my-app",
    issuer: {
        cobalt: auth({
            // Auth configuration
        })
    }
};
```

### `server/operations/` - Operations Directory

Contains your queries, mutations, and subscriptions.

## Operation File Naming

The operation name in GraphQL is derived from the file path:

| File Path | GraphQL Operation |
|-----------|-------------------|
| `operations/users.ts` | `users` |
| `operations/createUser.ts` | `createUser` |
| `operations/posts/index.ts` | `posts` |
| `operations/posts/create.ts` | `postsCreate` |
| `operations/admin/users/list.ts` | `adminUsersList` |

### Naming Rules

1. **File name without extension** becomes part of the operation name
2. **Nested folders** are concatenated with camelCase
3. **`index.ts`** files use only the folder name
4. **Underscores** in folder names (like `_utils`) are typically used for shared logic without exporting operations

## Operation Exports

Each operation file can export a function named `Query`, `Mutation`, or `Subscription`.
Right now, you can only export one operation per file.

### `Query` - GraphQL Query

```typescript
export function Query() {
    return { /* ... */ };
}
```

### `Mutation` - GraphQL Mutation

```typescript
export function Mutation(data: CreateInput) {
    return { /* ... */ };
}
```

### `Subscription` - GraphQL Subscription

```typescript
export async function* Subscription() {
    yield { /* ... */ };
}
```

### `__typename` - Custom Type Name

```typescript
export const __typename = "MyCustomType";
```

## Extended Type Files

Place field resolvers for extended types in `server/types/<__typename>.ts`:

```typescript
// server/types/User.ts
export function image() {
    const { name } = $$root.User(this);
    return `https://ui-avatars.com/api/?name=${name}`;
}

export function email() {
    const { name } = $$root.User(this);
    return `${name}@example.com`;
}

```

Only types that have been annotated with `export const __typename = "..."` in an operation file can be extended.

```typescript
// server/operations/users.ts
export function Query() {
    return {
        id: "1",
        name: "John",
    };
}

export const __typename = "User";
```

For the type `User`, the corresponding extended type file will be `server/types/User.ts` and for example adding the field `email` to the type `User` will look like this:

```typescript
// server/types/User.ts
export function email() {
    const { name } = $$root.User(this);
    return `${name}@example.com`;
}
```

This will be automatically added to the GraphQL schema as a field of the type `User`.

## Generated Files

Cobalt generates several files during development:

```
.cobalt/
├── schema.graphql      # Generated GraphQL schema
├── resolvers.ts        # Generated resolvers
└── sdk/                # Generated SDK
    └── index.ts
```

::: tip
The `.cobalt` directory is typically gitignored as it's regenerated on each build.
:::

## Best Practices

### Group Related Operations

```
operations/
├── users/
│   ├── get.ts          # query.usersGet
│   ├── list.ts         # query.usersList
│   ├── create.ts       # mutation.usersCreate
│   └── update.ts       # mutation.usersUpdate
```

### Co-locate Helpers

You can include helper files that aren't operations:

```
operations/
├── users/
│   ├── index.ts        # The actual operation
│   ├── helpers.ts      # Helper functions (not exported as operation)
│   └── validators.ts   # Validation logic
```

Only files exporting `Query`, `Mutation`, or `Subscription` are treated as operations.

### Use Directories for Shared Logic

For example, if you have a lot of operations that use the same logic, you can keep it in a shared directory:

```
server/
├── operations/
│   └── users/
│       ├── get.ts
│       ├── list.ts
│       ├── create.ts
│       ├── update.ts
│       ├── delete.ts
│       └── _utils/
│           └── index.ts
│           └── validators.ts
│           └── utils.ts
```

## Next Steps

- [Operations Overview](/guide/operations) — Learn about different operation types
- [Context Factory](/guide/context) — Configure your context
- [Types & Schemas](/guide/types) — Work with custom types
