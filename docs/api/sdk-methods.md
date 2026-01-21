# SDK Methods

The generated SDK provides type-safe methods for calling your GraphQL operations.

## SDK Structure

```typescript
import sdk, { _, type YourTypes } from "sdk";

sdk.init({ /* config */ });

sdk.query.operationName      // Queries
sdk.mutation.operationName   // Mutations
sdk.subscription.operationName  // Subscriptions
```

## `sdk.init()`

Initialize the SDK with configuration.

### Syntax

```typescript
sdk.init(config: SDKConfig): void
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `fetcher` | `(url, options) => Promise<Response>` | Custom fetch function |
| `auth` | `string \| (() => string)` | Authentication token |
| `sseFetchTransform` | `(input, init) => [string, RequestInit]` | Transform SSE requests |

### Examples

#### Basic Initialization

```typescript
sdk.init({});
```

#### With Static Auth Token

```typescript
sdk.init({
    auth: "your-access-token"
});
```

#### With Dynamic Auth

```typescript
sdk.init({
    auth: () => localStorage.getItem("token") ?? ""
});
```

#### With Cookie Auth (React Router 7)

```typescript
import { accessTokenFromCookie } from "@cobalt27/auth/react/rr7";

sdk.init({
    auth: accessTokenFromCookie
});
```

#### With Custom Fetcher

```typescript
sdk.init({
    fetcher: async (url, options) => {
        console.log("Request:", url);
        const response = await fetch(url, options);
        console.log("Response:", response.status);
        return response;
    }
});
```

---

## Queries

### Scalar Return

```typescript
// Query returning a scalar
const result = await sdk.query.hello;
// result: string
```

### With Arguments

```typescript
const result = await sdk.query.greet({ name: "World" });
// result: string
```

### Object Return

```typescript
// Query returning an object - call with ()
const user = await sdk.query.user({ id: "123" })();
// user: { id, name, email, ... }
```

### With Field Selection

```typescript
const user = await sdk.query.user({ id: "123" })(
    ({ id, name }) => ({ id, name })
);
// user: { id: string; name: string }
```

### Lazy Query

```typescript
const getUser = sdk.query.user({ id: _ })().$lazy;

const user = await getUser({ id: "123" });
```

---

## Mutations

### Basic Mutation

```typescript
const result = await sdk.mutation.createUser({
    name: "John",
    email: "john@example.com"
})();
```

### With Field Selection

```typescript
const user = await sdk.mutation.createUser({
    name: "John",
    email: "john@example.com"
})(({ id }) => ({ id }));
// user: { id: string }
```

### Lazy Mutation

```typescript
const createUser = sdk.mutation.createUser(_)().$lazy;

const user = await createUser({
    name: "John",
    email: "john@example.com"
});
```

---

## Subscriptions

### Basic Subscription

```typescript
for await (const event of await sdk.subscription.onEvent()) {
    console.log(event);
}
```

### With Arguments

```typescript
const subscription = await sdk.subscription.onMessage({
    channelId: "general"
})(({ id, text }) => ({ id, text }));

for await (const message of subscription) {
    console.log(message);
}
```

### Lazy Subscription

```typescript
const subscribe = sdk.subscription.onMessage({ channelId: _ })(
    ({ id, text }) => ({ id, text })
).$lazy;

const subscription = await subscribe({ channelId: "general" });

for await (const message of subscription) {
    console.log(message);
}
```

---

## The Placeholder `_`

Used with `$lazy` to create reusable operations.

### Import

```typescript
import sdk, { _ } from "sdk";
```

### Usage

```typescript
// Single placeholder
const getUser = sdk.query.user({ id: _ })().$lazy;

// Multiple placeholders
const search = sdk.query.search({
    query: _,
    limit: _,
    offset: _
})().$lazy;

// Provide values when calling
const results = await search({
    query: "test",
    limit: 10,
    offset: 0
});
```

---

## `$lazy`

Converts an operation to a reusable function.

### Syntax

```typescript
const fn = sdk.query.operation({ args })().$lazy;
const result = await fn({ args });
```

### Examples

```typescript
// Query
const getUser = sdk.query.user({ id: _ })().$lazy;

// Mutation
const createTodo = sdk.mutation.createTodo(_)().$lazy;

// Subscription
const streamEvents = sdk.subscription.events(_).$lazy;
```

---

## `.auth()`

Set authentication for a single request.

### Syntax

```typescript
await sdk.query.operation().auth(token);
```

### Example

```typescript
const user = await sdk.query.profile()
    .auth("specific-token-for-this-request");
```

---

## Type Exports

The SDK exports types for all operations.

### Import Types

```typescript
import sdk, { _, type User, type CreateUserInput } from "sdk";
```

### Using Types

```typescript
import type { User, Todo, CreateTodoInput } from "sdk";

function displayUser(user: User) {
    console.log(user.name);
}

function createTodoItem(input: CreateTodoInput) {
    return sdk.mutation.createTodo(input)();
}
```

---

## Error Handling

### Try-Catch

```typescript
try {
    const user = await sdk.query.user({ id: "invalid" })();
} catch (error) {
    if (error instanceof Error) {
        console.error("Query failed:", error.message);
    }
}
```

### Response Errors

```typescript
const result = await sdk.query.user({ id: "123" })()
    .catch(error => {
        // Handle GraphQL errors
        console.error(error.errors);
        return null;
    });
```

---

## Complete Example

```typescript
import sdk, { _, type Todo, type CreateTodoInput } from "sdk";
import { accessTokenFromCookie } from "@cobalt27/auth/react/rr7";

// Initialize
sdk.init({
    auth: accessTokenFromCookie
});

// Define operations
export const getTodos = sdk.query.todos(_)().$lazy;
export const createTodo = sdk.mutation.createOneTodo(_)().$lazy;
export const updateTodo = sdk.mutation.updateOneTodo(_)().$lazy;
export const deleteTodo = sdk.mutation.deleteOneTodo(_)().$lazy;
export const streamTodos = sdk.subscription.streamTodos(_)().$lazy;

// Usage
async function loadTodos(search?: string): Promise<Todo[]> {
    return getTodos({
        where: {
            text: { contains: search || undefined }
        }
    });
}

async function addTodo(text: string): Promise<Todo> {
    return createTodo({
        data: { text, completed: false }
    });
}

async function toggleTodo(id: string, completed: boolean): Promise<Todo> {
    return updateTodo({
        where: { id },
        data: { completed: !completed }
    });
}

async function removeTodo(id: string): Promise<void> {
    await deleteTodo({ where: { id } });
}

async function* subscribeToTodos() {
    for await (const todo of await streamTodos({ where: {} })) {
        yield todo;
    }
}
```

## Next Steps

- [The $lazy Pattern](/guide/lazy-pattern) — Detailed lazy pattern guide
- [Field Selection](/guide/field-selection) — Advanced field selection
- [Frontend Integration](/guide/frontend-integration) — Using with React
