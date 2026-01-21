# Generated SDK

Cobalt automatically generates a fully type-safe SDK using [Samarium](https://github.com/liontariai/samarium). This SDK provides an intuitive way to call your GraphQL operations with complete TypeScript support.

## Importing the SDK

The SDK is generated in the `.cobalt/sdk.ts` file.

When you use `bunx @cobalt27/dev init`, your `tsconfig.json` is updated to include the SDK file as path alias, so you can import it like this:

```typescript
import sdk from "sdk";
```

The SDK includes:
- All your queries under `sdk.query`
- All your mutations under `sdk.mutation`
- All your subscriptions under `sdk.subscription`

## SDK Initialization

Initialize the SDK with your configuration:

```typescript
sdk.init({
    // Custom fetch function (optional)
    fetcher: async (url, options) => {
        return fetch(url, options);
    },
    
    // Auth token (optional)
    auth: "your-access-token",
    
    // Or a function that returns the token
    auth: () => getStoredToken(),
});
```

## Calling Queries

### Simple Scalar Return

```typescript
// Query returning a string
const greeting = await sdk.query.hello;
// => "Hello, World!"
```

### With Arguments

```typescript
// Query with arguments
const user = await sdk.query.user({ id: "123" })();
// => { id: "123", name: "John", email: "john@example.com" }
```

### No Arguments, Object Return

When a query returns an object, call it with `()`:

```typescript
// Returns object type
const profile = await sdk.query.profile();
// => { name: "John", avatar: "https://..." }
```

## Calling Mutations

Mutations work the same way as queries:

```typescript
// Simple mutation
const result = await sdk.mutation.createUser({
    name: "Jane",
    email: "jane@example.com"
})();

// => { id: "new-id", name: "Jane", email: "jane@example.com" }
```

## Calling Subscriptions

Subscriptions return async iterables:

```typescript
// Subscribe to events
for await (const event of await sdk.subscription.onMessage({ 
    channelId: "general" 
})) {
    console.log(event);
}
```

## Field Selection

For queries returning objects, you can select specific fields using a selector function:

### Select All Fields

```typescript
const user = await sdk.query.user({ id: "123" })();
// Returns all fields
```

### Select Specific Fields

```typescript
const user = await sdk.query.user({ id: "123" })(
    ({ id, name }) => ({ id, name })
);
// Returns only id and name
```

### Nested Selection

```typescript
const user = await sdk.query.user({ id: "123" })(
    ({ id, profile }) => ({
        id,
        profile: profile(({ avatar, bio }) => ({ avatar, bio }))
    })
);
// => { id: "123", profile: { avatar: "...", bio: "..." } }
```

## The Placeholder `_`

Import the placeholder for creating lazy operations:

```typescript
import sdk, { _ } from "sdk";

// Use _ as a placeholder for arguments
const getUser = sdk.query.user({ id: _ })().$lazy;

// Later, provide the actual value
const user = await getUser({ id: "123" });
```

## Type Exports

The SDK exports types for all your operations:

```typescript
import sdk, { _, type User, type Todo, type CreateTodoInput } from "sdk";

// Use types in your code
function displayUser(user: User) {
    console.log(user.name);
}
```

## Authentication

### Static Token

```typescript
sdk.init({
    auth: "your-access-token"
});
```

### Dynamic Token

```typescript
sdk.init({
    auth: () => localStorage.getItem("access_token")
});
```

### Cookie-Based Auth (React Router 7)

```typescript
import { accessTokenFromCookie } from "@cobalt27/auth/react/rr7";

sdk.init({
    auth: accessTokenFromCookie
});
```

### Per-Request Auth

```typescript
const result = await sdk.query.profile()
    .auth("specific-token");
```

## Custom Fetcher

Override the default fetch behavior:

```typescript
sdk.init({
    fetcher: async (url, options) => {
        // Add custom headers
        const response = await fetch(url, {
            ...options,
            headers: {
                ...options?.headers,
                "X-Custom-Header": "value"
            }
        });
        return response;
    }
});
```

## Error Handling

```typescript
try {
    const user = await sdk.query.user({ id: "invalid" })();
} catch (error) {
    if (error instanceof Error) {
        console.error("Query failed:", error.message);
    }
}
```

## Complete Example

```typescript
import sdk, { _, type TodoWithBy } from "sdk";
import { accessTokenFromCookie } from "@cobalt27/auth/react/rr7";

// Initialize
sdk.init({
    auth: accessTokenFromCookie
});

// Define lazy operations
export const getTodos = sdk.query.todos(_)().$lazy;
export const createTodo = sdk.mutation.createOneTodo(_)().$lazy;
export const updateTodo = sdk.mutation.updateOneTodo(_)().$lazy;
export const deleteTodo = sdk.mutation.deleteOneTodo(_)().$lazy;
export const streamTodos = sdk.subscription.streamTodos(_)().$lazy;

// Use in components
async function loadTodos(search?: string) {
    return getTodos({
        where: {
            text: { contains: search || undefined }
        }
    });
}

async function addTodo(text: string) {
    return createTodo({
        data: { text, completed: false }
    });
}

async function toggleTodo(id: string, completed: boolean) {
    return updateTodo({
        where: { id },
        data: { completed: !completed }
    });
}
```

## Next Steps

- [The $lazy Pattern](/guide/lazy-pattern) — Deep dive into lazy operations
- [Field Selection](/guide/field-selection) — Advanced selection techniques
- [Frontend Integration](/guide/frontend-integration) — Using the SDK with React
