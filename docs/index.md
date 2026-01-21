---
layout: home

hero:
  name: "Cobalt"
  text: "GraphQL without the ``GraphQL``"
  tagline: tRPC's speed, GQL's flexibility. No headaches. No compromise.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/liontariai/cobalt

features:
  - icon: "🚀"
    title: Write Plain TypeScript, Get GraphQL
    details: Define your business logic as simple TypeScript functions. Cobalt automatically generates the GraphQL schema and resolvers.
  - icon: "📝"
    title: Type-Safe SDK
    details: Get a fully typed SDK powered by Samarium. Enjoy complete autocomplete and type checking for all your API calls.
  - icon: "🔐"
    title: Built-in Auth
    details: Cobalt Auth integrates OpenAuthJS for seamless authentication with multiple providers including OAuth and passwordless.
  - icon: "⚡"
    title: Real-time Subscriptions
    details: Define subscriptions using generator functions. Stream data to clients with GraphQL subscriptions over SSE.
  - icon: "🛠️"
    title: Developer Experience
    details: Hot reload during development, automatic type generation, and intuitive file-based routing for operations.
  - icon: "📦"
    title: Production Ready
    details: Build and deploy with Docker support. Optimized for production with bundled output.
---

## Quick Start

```bash
bunx @cobalt27/dev init
```

## Simple Example

Define a query in `server/operations/hello.ts`:

```typescript
export function Query(name: string) {
    return `Hello, ${name}!`;
}
```

Use it in your frontend:

```typescript
import sdk from "sdk";

const greeting = await sdk.query.hello({ name: "Peter" });
// => "Hello, Peter!"
```

That's it! Cobalt handles the GraphQL schema generation, type inference, and SDK creation automatically.
