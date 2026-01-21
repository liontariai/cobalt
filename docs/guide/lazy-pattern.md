# The $lazy Pattern

The `$lazy` pattern is one of Cobalt's most powerful features. It allows you to define operations with placeholders and call them later with actual values.

## What is $lazy?

`$lazy` transforms an operation into a reusable function.

It keeps your selection of fields, arguments and `.auth()` config, but defers the actual call to the operation.

```typescript
import sdk, { _ } from "sdk";

// Define a lazy query with placeholder
const getUser = sdk.query.user({ id: _ })().$lazy;

// Call it later with actual values
const user1 = await getUser({ id: "1" });
const user2 = await getUser({ id: "2" });
```

## The Placeholder `_`

Import the placeholder from the SDK:

```typescript
import sdk, { _ } from "sdk";
```

Use `_` anywhere you want to defer the value:

```typescript
// Single placeholder
const getUser = sdk.query.user({ id: _ })().$lazy;

// Multiple placeholders
const searchUsers = sdk.query.users({
    search: _,
    limit: _,
    offset: _
})().$lazy;

// Call with all values
const results = await searchUsers({
    search: "john",
    limit: 10,
    offset: 0
});
```

## Why Use $lazy?

### 1. Reusable Operations

```typescript
// Define once
const getTodo = sdk.query.todo({ id: _ })().$lazy;

// Use many times
async function toggleTodo(id: string) {
    const todo = await getTodo({ id });
    return updateTodo({ id, completed: !todo.completed });
}

async function displayTodo(id: string) {
    const todo = await getTodo({ id });
    console.log(todo.text);
}
```

### 2. React Hooks Integration

```typescript
// Define lazy operations
const getTodos = sdk.query.todos(_)().$lazy;

// Use with SWR
function useTodos(search: string) {
    return useSWR(
        ["todos", search],
        () => getTodos({ where: { text: { contains: search } } })
    );
}
```

### 3. Clean Function Signatures

```typescript
// Without $lazy - verbose
async function fetchUser(id: string) {
    return sdk.query.user({ id })();
}

// With $lazy - cleaner export
export const fetchUser = sdk.query.user({ id: _ })().$lazy;
```

### 4. Testing

```typescript
// Easy to mock
const getUser = sdk.query.user({ id: _ })().$lazy;

// In tests
jest.mock("sdk", () => ({
    query: {
        user: () => ({ $lazy: async ({ id }) => ({ id, name: "Mock" }) })
    }
}));
```

## Patterns

### Queries

```typescript
// No arguments
const getAllUsers = sdk.query.users().$lazy;
const users = await getAllUsers();

// With arguments
const getUser = sdk.query.user({ id: _ })().$lazy;
const user = await getUser({ id: "123" });

// Multiple arguments
const searchPosts = sdk.query.posts({
    query: _,
    category: _,
    limit: _
})().$lazy;

const posts = await searchPosts({
    query: "typescript",
    category: "tutorials",
    limit: 10
});
```

### Mutations

```typescript
// Create
const createTodo = sdk.mutation.createOneTodo(_)().$lazy;
await createTodo({
    data: { text: "Learn Cobalt", completed: false }
});

// Update
const updateTodo = sdk.mutation.updateOneTodo(_)().$lazy;
await updateTodo({
    where: { id: "123" },
    data: { completed: true }
});

// Delete
const deleteTodo = sdk.mutation.deleteOneTodo(_)().$lazy;
await deleteTodo({
    where: { id: "123" }
});
```

### Subscriptions

```typescript
// Define lazy subscription
const streamMessages = sdk.subscription.onMessage({ channelId: _ }).$lazy;

// Subscribe later
const subscription = await streamMessages({ channelId: "general" });

for await (const message of subscription) {
    console.log(message);
}
```

## With Field Selection

Combine `$lazy` with field selection:

```typescript
// Select specific fields
const getUserBasic = sdk.query.user({ id: _ })(
    ({ id, name }) => ({ id, name })
).$lazy;

const basicUser = await getUserBasic({ id: "123" });
// => { id: "123", name: "John" }

// Select nested fields
const getUserWithProfile = sdk.query.user({ id: _ })(
    ({ id, profile }) => ({
        id,
        profile: profile(({ avatar }) => ({ avatar }))
    })
).$lazy;

const userWithProfile = await getUserWithProfile({ id: "123" });
// => { id: "123", profile: { avatar: "https://..." } }
```

## Partial Placeholders

Mix concrete values with placeholders:

```typescript
// Fixed limit, variable search
const searchTenUsers = sdk.query.users({
    search: _,
    limit: 10  // Fixed
})().$lazy;

const results = await searchTenUsers({ search: "john" });
```

## Type Safety

The `$lazy` function preserves full type safety:

```typescript
const getUser = sdk.query.user({ id: _ })().$lazy;

// ✅ Correct usage
const user = await getUser({ id: "123" });

// ❌ Type error - missing required field
const user = await getUser({});

// ❌ Type error - wrong type
const user = await getUser({ id: 123 });
```

## Best Practices

### 1. Define at Module Level

```typescript
// ✅ Good - defined once
const getUser = sdk.query.user({ id: _ })().$lazy;

export function useUser(id: string) {
    return useSWR(["user", id], () => getUser({ id }));
}

// ❌ Avoid - recreated on each call
export function useUser(id: string) {
    const getUser = sdk.query.user({ id: _ })().$lazy;
    return useSWR(["user", id], () => getUser({ id }));
}
```

### 2. Export for Reuse

```typescript
// operations.ts
import sdk, { _ } from "sdk";

export const getTodos = sdk.query.todos(_)().$lazy;
export const createTodo = sdk.mutation.createOneTodo(_)().$lazy;
export const updateTodo = sdk.mutation.updateOneTodo(_)().$lazy;
export const deleteTodo = sdk.mutation.deleteOneTodo(_)().$lazy;

// component.tsx
import { getTodos, createTodo } from "./operations";
```

### 3. Meaningful Names

```typescript
// ✅ Good - descriptive names
const getUserById = sdk.query.user({ id: _ })().$lazy;
const searchUsersByName = sdk.query.users({ name: _ })().$lazy;
const createNewTodo = sdk.mutation.createOneTodo(_)().$lazy;

// ❌ Avoid - generic names
const query1 = sdk.query.user({ id: _ })().$lazy;
const mutation1 = sdk.mutation.createOneTodo(_)().$lazy;
```

## Complete Example

```typescript
// api/operations.ts
import sdk, { _ } from "sdk";

// Queries
export const getTodos = sdk.query.todos(_)().$lazy;
export const getTodoById = sdk.query.todo({ id: _ })().$lazy;

// Mutations
export const createTodo = sdk.mutation.createOneTodo(_)().$lazy;
export const updateTodo = sdk.mutation.updateOneTodo(_)().$lazy;
export const deleteTodo = sdk.mutation.deleteOneTodo(_)().$lazy;

// Subscriptions
export const streamTodos = sdk.subscription.streamTodos(_)().$lazy;
```

```typescript
// components/TodoList.tsx
import { getTodos, createTodo, updateTodo, deleteTodo, streamTodos } from "../api/operations";

export function TodoList() {
    const [todos, setTodos] = useState([]);
    
    useEffect(() => {
        getTodos({ where: {} }).then(setTodos);
    }, []);
    
    useAsyncIterable(
        () => streamTodos({ where: {} }),
        (newTodo) => setTodos(prev => [...prev, newTodo]),
        () => {}
    );
    
    const handleAdd = async (text: string) => {
        await createTodo({ data: { text, completed: false } });
        const updated = await getTodos({ where: {} });
        setTodos(updated);
    };
    
    const handleToggle = async (todo) => {
        await updateTodo({
            where: { id: todo.id },
            data: { completed: !todo.completed }
        });
    };
    
    const handleDelete = async (id: string) => {
        await deleteTodo({ where: { id } });
        setTodos(prev => prev.filter(t => t.id !== id));
    };
    
    return (/* ... */);
}
```

## Next Steps

- [Field Selection](/guide/field-selection) — Control what data you fetch
- [SDK Usage](/guide/sdk) — Full SDK documentation
- [Frontend Integration](/guide/frontend-integration) — Using with React
