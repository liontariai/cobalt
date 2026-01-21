# Getting Started

This guide will walk you through setting up a new Cobalt project from scratch.

## Prerequisites

- [Bun](https://bun.sh) runtime
- Basic knowledge of TypeScript

## Installation

Create a new Cobalt project using the CLI:

```bash
bunx @cobalt27/dev init --name my-cobalt-app
```

This command will:
1. Create the project structure
3. Set up the configuration files

Next, you need to navigate to the project directory and install the dependencies.

Navigate to the project directory:
```bash
cd my-cobalt-app
```

Install dependencies:
```bash
bun install
```

## Project Structure

After initialization, your project will look like this:

```
my-cobalt-app/
├── src/
│   ├── index.ts                # Example client code
│   └── server/
│       ├── ctx.ts              # Context factory           (required)
│       ├── operations/         # Your operations go here   (required)
│       └── types/              # Extended GraphQL types    (optional)
├── package.json
└── tsconfig.json
```

## Creating the Context Factory

The context factory in `server/ctx.ts` provides shared data to all your operations:

```typescript
export default async function ({ headers }: CobaltCtxInput) {
    // You can access request headers and set up
    // database connections, authentication, etc.
    return {
        headers,
        // Add any data you want available in operations
    };
}
```

## Creating Your First Query

Create a file `server/operations/hello.ts`:

```typescript
export function Query(name: string) {
    return `Hello, ${name}!`;
}
```

That's it! This creates a GraphQL query called `hello` that takes a `name` argument and returns a string.

## Running the Development Server

Start the development server:

```bash
bunx cobalt dev
```

The server will start on `http://localhost:4000` by default. You'll see:

- Hot reload when you change operation files
- Automatic schema regeneration
- SDK updates on the fly

## Using the Generated SDK

The SDK is automatically generated and can be imported in your frontend code:

```typescript
import sdk from "sdk";

// Call your query
const greeting = await sdk.query.hello({ name: "World" });
console.log(greeting); // "Hello, World!"
```

## Adding More Operations

### A Query with Complex Return Type

```typescript
// server/operations/user.ts
export function Query(id: string) {
    return {
        id,
        name: "John Doe",
        email: "john@example.com",
        createdAt: new Date()
    };
}

// Optionally customize the GraphQL type name
export const __typename = "User";
```

```typescript
// client code
import sdk from "sdk";

const user = await sdk.query.user({ id: "123" });
console.log(user);
// => {
//     id: "123",
//     name: "John Doe",
//     email: "john@example.com",
//     createdAt: Date("2026-01-01T00:00:00.000Z")
// }
//     ^ createdAt is already a Date object because of lazy custom scalar deserialization
```

### A Mutation

```typescript
// server/operations/createUser.ts
export function Mutation(name: string, email: string) {
    // Your creation logic here
    return {
        id: "new-id",
        name,
        email
    };
}

export const __typename = "User";
```

```typescript
// client code
import sdk from "sdk";

const user = await sdk.mutation.createUser({
    name: "John Doe",
    email: "john@example.com"
})();
console.log(user);
// => { id: "new-id", name: "John Doe", email: "john@example.com" }
```

### A Subscription

```typescript
// server/operations/onUserCreated.ts
export async function* Subscription() {
    // Use your pub/sub system here
    for await (const user of userCreatedStream) {
        yield user;
    }
}
```

```typescript
// client code
import sdk from "sdk";

const subscription = await sdk.subscription.onUserCreated()();
for await (const user of subscription) {
    console.log(user);
}
```

## Using Context in Operations

Access your context using the `$$ctx` helper:

> **Note:** The `$$ctx`, `$$auth`, and `$$root` helpers are "magic" functions made available through TypeScript path aliases. See the [Magic Helper Functions](/guide/magic-helpers) guide to understand how they work.

```typescript
// server/operations/isAuthenticated.ts
export function Query() {
    const { headers } = $$ctx(this);
    
    // Access headers or other context data
    const authHeader = headers.get("Authorization");
    
    return {
        authenticated: !!authHeader
    };
}
```

```typescript
// client code
import sdk from "sdk";

const isAuthenticated = await sdk.query.isAuthenticated();
console.log(isAuthenticated);
// => { authenticated: true }
```

## Next Steps

- [Magic Helper Functions](/guide/magic-helpers) — Understand how `$$ctx`, `$$auth`, and `$$root` work
- [Project Structure](/guide/project-structure) — Learn about file organization
- [Queries](/guide/queries) — Deep dive into queries
- [Context Factory](/guide/context) — Learn about the context system
- [Cobalt Auth](/guide/auth) — Add authentication to your app
