# Frontend Integration

This guide covers how to integrate Cobalt with your frontend application, with a focus on React Router 7.

## SDK Setup

The generated SDK needs to be initialized before use:

```typescript
import sdk from "sdk";

sdk.init({
    // Configuration options
});
```

## React Router 7 Integration

### Basic Setup

```typescript
// root.tsx
import sdk from "sdk";

sdk.init({
    // Default configuration
});

export default function Root() {
    return (
        <html>
            <body>
                <Outlet />
            </body>
        </html>
    );
}
```

### With Authentication

```typescript
// root.tsx
import { redirect } from "react-router";
import sdk from "sdk";
import {
    makeAuthLoader,
    accessTokenFromCookie,
} from "@cobalt27/auth/react/rr7";

// Initialize with cookie-based auth
sdk.init({
    auth: accessTokenFromCookie,
});

// Create the auth loader
export const loader = makeAuthLoader(
    {
        clientID: "my-app",
        issuer: "http://localhost:4000",
        unprotectedPaths: ["/login", "/error", "/logout"],
    },
    (tokens) => {
        // Re-initialize with fresh tokens
        sdk.init({
            auth: tokens.tokens.access,
        });
    },
    (error) => {
        return redirect("/error?error=" + error);
    }
);

export default function Root() {
    return (
        <html>
            <body>
                <Outlet />
            </body>
        </html>
    );
}
```

## Data Fetching

### Basic Query

```typescript
// routes/users.tsx
import sdk from "sdk";

export const loader = async () => {
    const users = await sdk.query.users();
    return { users };
};

export default function Users() {
    const { users } = useLoaderData<typeof loader>();
    
    return (
        <ul>
            {users.map(user => (
                <li key={user.id}>{user.name}</li>
            ))}
        </ul>
    );
}
```

### With SWR

```typescript
import useSWR from "swr";
import sdk, { _ } from "sdk";

const getTodos = sdk.query.todos(_)().$lazy;

export default function TodoList() {
    const [search, setSearch] = useState("");
    
    const { data: todos, mutate } = useSWR(
        ["todos", search],
        () => getTodos({
            where: {
                text: { contains: search || undefined }
            }
        })
    );
    
    return (
        <div>
            <input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
            />
            <ul>
                {todos?.map(todo => (
                    <li key={todo.id}>{todo.text}</li>
                ))}
            </ul>
        </div>
    );
}
```

### With React Query

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import sdk, { _ } from "sdk";

const getUser = sdk.query.user({ id: _ })().$lazy;
const updateUser = sdk.mutation.updateUser(_)().$lazy;

export default function UserProfile({ userId }) {
    const queryClient = useQueryClient();
    
    const { data: user, isLoading } = useQuery({
        queryKey: ["user", userId],
        queryFn: () => getUser({ id: userId })
    });
    
    const mutation = useMutation({
        mutationFn: (data) => updateUser({ id: userId, data }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["user", userId] });
        }
    });
    
    if (isLoading) return <div>Loading...</div>;
    
    return (
        <div>
            <h1>{user.name}</h1>
            <button onClick={() => mutation.mutate({ name: "New Name" })}>
                Update
            </button>
        </div>
    );
}
```

## Mutations

### Basic Mutation

```typescript
import sdk from "sdk";

const createTodo = sdk.mutation.createOneTodo(_)().$lazy;

export default function CreateTodoForm() {
    const [text, setText] = useState("");
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        await createTodo({
            data: { text, completed: false }
        });
        
        setText("");
        // Refresh data...
    };
    
    return (
        <form onSubmit={handleSubmit}>
            <input 
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
            <button type="submit">Add</button>
        </form>
    );
}
```

### Optimistic Updates

```typescript
import useSWR, { useSWRConfig } from "swr";

const updateTodo = sdk.mutation.updateOneTodo(_)().$lazy;

function TodoItem({ todo }) {
    const { mutate } = useSWRConfig();
    
    const toggleComplete = async () => {
        // Optimistically update
        mutate(
            ["todos"],
            (current) => current.map(t => 
                t.id === todo.id 
                    ? { ...t, completed: !t.completed }
                    : t
            ),
            { revalidate: false }
        );
        
        // Actually update
        await updateTodo({
            where: { id: todo.id },
            data: { completed: !todo.completed }
        });
        
        // Revalidate
        mutate(["todos"]);
    };
    
    return (
        <li>
            <input 
                type="checkbox"
                checked={todo.completed}
                onChange={toggleComplete}
            />
            {todo.text}
        </li>
    );
}
```

## Subscriptions

### Custom Hook

```typescript
// hooks/useAsyncIterable.tsx
import { useEffect, useRef } from "react";

export function useAsyncIterable<T>(
    getIterable: () => Promise<AsyncIterable<T>>,
    onValue: (value: T) => void,
    onComplete: () => void,
    deps: any[] = []
) {
    useEffect(() => {
        let cancelled = false;

        (async () => {
            const iterable = await getIterable();
            const iterator = iterable[Symbol.asyncIterator]();

            while (!cancelled) {
                const { value, done } = await iterator.next();
                if (done || cancelled) break;
                onValue(value);
            }

            if (!cancelled) onComplete();
        })();

        return () => {
            cancelled = true;
        };
    }, deps);
}
```

### Using the Hook

```typescript
import { useAsyncIterable } from "@/hooks/useAsyncIterable";
import sdk, { _ } from "sdk";

const streamTodos = sdk.subscription.streamTodos(_)().$lazy;

export default function RealtimeTodos() {
    const [todos, setTodos] = useState<Todo[]>([]);
    const [newTodos, setNewTodos] = useState<Todo[]>([]);
    
    // Fetch initial todos
    useEffect(() => {
        sdk.query.todos()().then(setTodos);
    }, []);
    
    // Subscribe to new todos
    useAsyncIterable(
        async () => await streamTodos({ where: {} }),
        (todo) => {
            setNewTodos(prev => [...prev, todo]);
        },
        () => console.log("Stream ended")
    );
    
    const allTodos = [...todos, ...newTodos];
    
    return (
        <ul>
            {allTodos.map(todo => (
                <li key={todo.id}>{todo.text}</li>
            ))}
        </ul>
    );
}
```

## Error Handling

### Global Error Boundary

```typescript
// routes/error.tsx
import { useRouteError } from "react-router";

export default function ErrorPage() {
    const error = useRouteError();
    
    return (
        <div>
            <h1>Something went wrong</h1>
            <p>{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
    );
}
```

### Operation-Level Errors

```typescript
const handleCreate = async () => {
    try {
        await createTodo({ data: { text } });
    } catch (error) {
        if (error instanceof Error) {
            setError(error.message);
        }
    }
};
```

## Authentication Routes

### Login Page

```typescript
// routes/login.tsx
export default function Login() {
    // OpenAuthJS handles the login flow
    // The auth loader in root.tsx will redirect to the
    // OpenAuth login page automatically
    
    return (
        <div>
            <h1>Redirecting to login...</h1>
        </div>
    );
}
```

### Logout Route

```typescript
// routes/logout.tsx
import { redirect } from "react-router";

export const loader = async () => {
    // Clear auth cookies and redirect
    return redirect("/login", {
        headers: {
            "Set-Cookie": [
                "access_token=; Path=/; HttpOnly; Max-Age=0",
                "refresh_token=; Path=/; HttpOnly; Max-Age=0"
            ].join(", ")
        }
    });
};

export default function Logout() {
    return <div>Logging out...</div>;
}
```

## Complete Example

Here's a complete Todo app frontend:

```typescript
// routes/_index/route.tsx
import sdk, { _, type TodoWithBy } from "sdk";
import { useState, useMemo } from "react";
import { useAsyncIterable } from "@/hooks/useAsyncGen";
import useSWR from "swr";
import { Link } from "react-router-dom";

// Define lazy operations
const getTodos = sdk.query.todos(_)().$lazy;
const createTodo = sdk.mutation.createOneTodo(_)().$lazy;
const updateTodo = sdk.mutation.updateOneTodo(_)().$lazy;
const deleteTodo = sdk.mutation.deleteOneTodo(_)().$lazy;
const streamTodos = sdk.subscription.streamTodos(_)().$lazy;

export default function Index() {
    const [searchText, setSearchText] = useState("");
    const [todoText, setTodoText] = useState("");

    // Fetch todos with SWR
    const { data: todos, mutate: mutateTodos } = useSWR(
        ["todos", searchText],
        () => getTodos({
            where: {
                text: { contains: searchText || undefined }
            }
        })
    );

    // Handle new todo
    const handleAddTodo = async () => {
        if (!todoText.trim()) return;
        
        await createTodo({
            data: { text: todoText, completed: false }
        });
        
        setTodoText("");
        mutateTodos();
    };

    // Stream new todos from other users
    const [streamedTodos, setStreamedTodos] = useState<TodoWithBy[]>([]);
    
    useAsyncIterable(
        async () => await streamTodos({ where: {} }),
        (todo) => setStreamedTodos(t => [...t, todo]),
        () => {}
    );

    // Combine fetched and streamed todos
    const allTodos = useMemo(
        () => [...(todos ?? []), ...streamedTodos],
        [todos, streamedTodos]
    );

    return (
        <div>
            <Link to="/logout">Logout</Link>
            
            <h1>Todo App</h1>
            
            <input
                placeholder="Search..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
            />
            
            <input
                placeholder="New todo..."
                value={todoText}
                onChange={(e) => setTodoText(e.target.value)}
            />
            <button onClick={handleAddTodo}>Add</button>
            
            <ul>
                {allTodos?.map((todo) => (
                    <TodoItem 
                        key={todo.id} 
                        todo={todo}
                        onUpdate={mutateTodos}
                    />
                ))}
            </ul>
        </div>
    );
}
```

## Next Steps

- [SDK Usage](/guide/sdk) — Master the generated SDK
- [The $lazy Pattern](/guide/lazy-pattern) — Reusable operations
- [Examples](/examples/todo-app) — Complete example app
