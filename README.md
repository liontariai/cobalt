<div align="center">

# Cobalt

<p align="center">
  <a href="https://npmjs.com/package/@cobalt27/dev">
    <img src="https://img.shields.io/npm/v/%40cobalt27%2Fdev?style=for-the-badge&color=fe7d37" alt="NPM Version">
  </a>
  <a href="https://npmjs.com/package/@cobalt27/dev">
    <img src="https://img.shields.io/npm/dm/%40cobalt27%2Fdev?style=for-the-badge&color=4c1" alt="Downloads">
  </a>
   <a href="https://github.com/liontariai/cobalt/commits/main/">
    <img src="https://img.shields.io/github/last-commit/liontariai/cobalt?style=for-the-badge&color=2563EB" alt="Last Commit">
  </a>
</p>

<h1>
  The Power of GraphQL, without <code>GraphQL</code>.
</h1>

<h3>
  The last framework that actually makes sense, in the age of AI.
</h3>

<p align="center">
  <br />
  <a href="https://cobalt27.dev"><strong>🌐 Website</strong></a> ·
  <a href="https://cobalt27.dev/docs"><strong>📚 Documentation</strong></a> ·
  <a href="https://cobalt27.dev/docs/guide/getting-started"><strong>🚀 Get Started</strong></a>
  <br />
</p>

</div>

<br />

## Why Cobalt?

Cobalt is a high-performance TypeScript framework that **automatically infers GraphQL schemas** from your resolvers. It creates a magnetic bond between your backend and frontend.

- **File-based Resolvers**: Your folder structure defines your API.
- **Inferred Schema**: No `.graphql` files. You write TypeScript, Cobalt generates the schema.
- **Zero-Config SDK**: The client SDK is generated automatically and stays in sync with your backend.
- **Type Safety**: End-to-end type safety without the boilerplate.

## Quick Start

Get up and running in seconds:

```bash
bunx @cobalt27/dev init
```

## How it Works

You write simple functions, and Cobalt turns them into a full GraphQL API.

### 1. Define your Operation
Simply export a function from a file in `server/operations`. The argument types and return type are automatically inferred.

```typescript
// server/operations/hello.ts
export function Query(name: string) {
    return {
        message: `Hello, ${name}!`,
        timestamp: new Date()
    };
}
```

### 2. Use it in your Client
The generated SDK gives you autocompletion and type safety instantly.

```typescript
// client/page.tsx
import sdk from "sdk";

const { message, timestamp } = await sdk.query.hello({ name: "World" })();
console.log(message); // Typed as string
console.log(timestamp); // Lazily deserialized Date object, no extra work
```

> **Want to dive deeper?** Check out the [Operations](https://cobalt27.dev/docs/guide/operations) guide in our documentation.

## Cobalt Auth

Cobalt comes with a powerful authentication system powered by [OpenAuthJS](https://github.com/sst/openauth).

It creates a seamless auth experience with fully typed access to user sessions and claims.

```typescript
// server/operations/profile.ts
export function Query() {
    // strict session typing
    const { token } = $$auth(this);
    
    return {
        email: token.subject.properties.email
    };
}
```

Read more about [Authentication](https://cobalt27.dev/docs/guide/auth) in the docs.

## License

Licensed under the **Server Side Public License (SSPL)**. See [LICENSE](LICENSE) for details.
