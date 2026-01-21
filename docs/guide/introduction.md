# What is Cobalt?

Cobalt is a TypeScript framework that lets you build GraphQL APIs backwards - starting in a tRPC-like style and then refining your schema and resolvers to evolve your API over time, to any level of complexity. Instead of writing GraphQL schemas and resolvers manually, you write simple TypeScript functions — Cobalt generates everything else automatically.

## The Problem

Building a GraphQL API typically requires:

1. Defining your schema in SDL (Schema Definition Language)
2. Writing resolver functions that match the schema
3. Keeping types synchronized between schema and resolvers
4. Manually creating or maintaining a client SDK

This process is error-prone and involves a lot of boilerplate.

Even if you use code-first approaches, you still have to write a lot of boilerplate code and typical client codegen tools do not provide the same level developer experience as [Samarium SDK](https://github.com/liontariai/samarium).

## The Cobalt Solution

With Cobalt, you:

1. **Write TypeScript functions** — Export `Query`, `Mutation`, or `Subscription` functions
2. **Get automatic schema generation** — Cobalt infers the GraphQL schema from your TypeScript types
3. **Receive a type-safe SDK** — A fully typed client SDK is generated using [Samarium](https://github.com/liontariai/samarium)
4. **Enjoy hot reload** — Changes are reflected instantly during development

## Key Features

### File-Based Operations

Operations are defined based on your folder structure:

```
server/
├── ctx.ts              # Context factory
├── operations/
│   ├── users.ts        # -> query.users
│   ├── posts/
│   │   └── index.ts    # -> query.posts
│   └── comments/
│       └── create.ts   # -> mutation.commentsCreate
```

### Type Inference

Return types and argument types are automatically inferred:

```typescript
// The GraphQL schema is generated from this TypeScript function
export function Query(userId: string) {
    return {
        id: userId,
        name: "John Doe",
        email: "john@example.com"
    };
}
```

### Real-time Subscriptions

Use generator functions for subscriptions:

```typescript
export async function* Subscription() {
    for await (const event of eventStream) {
        yield event;
    }
}
```

### Built-in Authentication

Cobalt Auth provides authentication out of the box using OpenAuthJS:

```typescript
export function Query() {
    const { token } = $$auth(this);
    const { email } = token.subject.properties;
    
    return { user: email };
}
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     Your TypeScript Code                    │
│                                                             │
│   export function Query(id: string) {                       │
│       return { id, name: "..." };                           │
│   }                                                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Cobalt Compiler                        │
│                                                             │
│   • Analyzes TypeScript types                               │
│   • Generates GraphQL schema                                │
│   • Creates resolvers                                       │
│   • Builds type-safe SDK                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       Generated Output                      │
│                                                             │
│   • GraphQL Schema (.graphql)                               │
│   • Resolvers (runtime)                                     │
│   • SDK with full TypeScript types                          │
└─────────────────────────────────────────────────────────────┘
```

## Comparison with Other Tools

| Feature | Cobalt | tRPC | GraphQL with Codegen |
|---------|--------|------|-----------------|
| Type-safe end-to-end | ✅ | ✅ | ✅ |
| No schema writing | ✅ | ✅ | ❌ |
| GraphQL compatible | ✅ | ❌ | ✅ |
| Subscriptions | ✅ | ✅ | ✅ |
| Built-in auth | ✅ | ❌ | ❌ |
| File-based routing | ✅ | ❌ | ❌ |

## Next Steps

- [Getting Started](/guide/getting-started) — Set up your first Cobalt project
- [Core Concepts](/guide/operations) — Learn about queries, mutations, and subscriptions
- [SDK Usage](/guide/sdk) — Understand how to use the generated SDK
