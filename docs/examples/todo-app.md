# Todo App Example

This example demonstrates a complete Todo application built with Cobalt, featuring:
- CRUD operations
- Real-time updates via subscriptions
- Authentication with Cobalt Auth
- React Router 7 frontend

## Project Structure

```
rr7-todo-app/
├── server/
│   ├── ctx.ts              # Context factory
│   ├── auth.ts             # Auth configuration
│   ├── operations/
│   │   ├── todos.ts        # List todos
│   │   ├── createOneTodo.ts
│   │   ├── updateOneTodo.ts
│   │   ├── deleteOneTodo.ts
│   │   └── streamTodos.ts  # Subscription
│   ├── types/
│   │   └── Todo.ts
│   └── util/
│       └── PubSub.ts
├── app/
│   ├── root.tsx
│   ├── routes/
│   │   ├── _index/
│   │   │   ├── route.tsx
│   │   │   ├── TodoInput.tsx
│   │   │   └── TodoItem.tsx
│   │   └── _auth/
│   │       ├── error.tsx
│   │       └── logout.tsx
│   └── hooks/
│       └── useAsyncGen.tsx
├── prisma/
│   └── schema.prisma
└── package.json
```

## Backend

### Context Factory

```typescript
// server/ctx.ts
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient, type Todo } from "../prisma/generated/client/client";
import { PubSub } from "./util/PubSub";

const client = new PGlite(process.env.DATABASE_URL!);
const adapter = new PrismaPGlite(client);
const pubSubTodos = new PubSub<Todo>();

export default async function ctx({ headers }: { headers: Headers }) {
    const prisma = new PrismaClient({ adapter });

    return {
        headers,
        prisma,
        pubsub: {
            todos: pubSubTodos,
        },
    };
}
```

### List Todos Query

```typescript
// server/operations/todos.ts
import { Prisma } from "../../prisma/generated/client/client";

export async function Query(
    where?: Omit<Prisma.TodoWhereInput, "AND" | "OR" | "NOT" | "ownerId">
) {
    const { prisma } = $$ctx(this);
    const { token: { subject: { properties: { email } } } } = $$auth(this);

    return (
        await prisma.todo.findMany({
            where: {
                ...where,
                ownerId: email,
            },
        })
    ).map((todo) => ({
        id: todo.id,
        text: todo.text,
        completed: todo.completed,
        createdAt: todo.createdAt,
        by: todo.ownerId,
    }));
}

export const __typename = "TodoWithBy";
```

### Create Todo Mutation

```typescript
// server/operations/createOneTodo.ts
import { Prisma } from "../../prisma/generated/client/client";

export async function Mutation(
    data: Omit<Prisma.TodoCreateInput, "ownerId">
) {
    const { prisma, pubsub } = $$ctx(this);
    const { token: { subject: { properties: { email } } } } = $$auth(this);

    const todo = await prisma.todo.create({
        data: {
            ...data,
            ownerId: email,
        },
    });

    // Notify subscribers
    pubsub.todos.publish("todos", todo);

    return todo;
}
```

### Update Todo Mutation

```typescript
// server/operations/updateOneTodo.ts
import { Prisma } from "../../prisma/generated/client/client";

export async function Mutation(
    where: Omit<Prisma.TodoWhereUniqueInput, "AND" | "OR" | "NOT" | "ownerId">,
    data: Omit<Prisma.TodoUpdateInput, "ownerId">
) {
    const { prisma } = $$ctx(this);
    const { token: { subject: { properties: { email } } } } = $$auth(this);

    const todo = await prisma.todo.update({
        where: {
            ...where,
            ownerId: email,
        },
        data,
    });

    return todo;
}

export const __typename = "Todo";
```

### Delete Todo Mutation

```typescript
// server/operations/deleteOneTodo.ts
import { Prisma } from "../../prisma/generated/client/client";

export async function Mutation(where: Prisma.TodoWhereUniqueInput) {
    const { prisma } = $$ctx(this);
    const { token: { subject: { properties: { email } } } } = $$auth(this);

    const todo = await prisma.todo.delete({
        where: {
            id: where.id,
            AND: [where, { ownerId: email }],
        },
    });
    
    return todo;
}
```

### Stream Todos Subscription

```typescript
// server/operations/streamTodos.ts
import { Prisma } from "../../prisma/generated/client/client";

export async function* Subscription(where: Prisma.TodoWhereInput) {
    const { pubsub } = $$ctx(this);
    const { token: { subject: { properties: { email } } } } = $$auth(this);

    for await (const todo of await pubsub.todos.asyncIterator("todos")) {
        // Only stream todos from other users
        if (todo.ownerId !== email) {
            yield {
                id: todo.id,
                text: todo.text,
                completed: todo.completed,
                createdAt: todo.createdAt,
                by: todo.ownerId,
            };
        }
    }
}
```

## Frontend

### Root Loader with Auth

```typescript
// app/root.tsx
import { redirect } from "react-router";
import sdk from "sdk";
import {
    makeAuthLoader,
    accessTokenFromCookie,
} from "@cobalt27/auth/react/rr7";

sdk.init({
    auth: accessTokenFromCookie,
});

export const loader = makeAuthLoader(
    {
        clientID: "client_id",
        issuer: "http://localhost:4000",
        unprotectedPaths: ["/error", "/logout"],
    },
    (tokens) => {
        sdk.init({
            auth: tokens.tokens.access,
        });
    },
    (error) => {
        return redirect("/error?error=" + error);
    }
);
```

### Main Route

```typescript
// app/routes/_index/route.tsx
import sdk, { _, type TodoWithBy } from "sdk";
import { useMemo, useState } from "react";
import { TodoInput } from "./TodoInput";
import { TodoItem } from "./TodoItem";
import { useAsyncIterable } from "@/hooks/useAsyncGen";
import useSWR from "swr";
import { Link } from "react-router-dom";

// Define lazy operations
export const getTodos = sdk.query.todos(_)().$lazy;
export const createTodo = sdk.mutation.createOneTodo(_)().$lazy;
export const updateTodo = sdk.mutation.updateOneTodo(_)().$lazy;
export const deleteTodo = sdk.mutation.deleteOneTodo(_)().$lazy;
export const streamTodos = sdk.subscription.streamTodos(_)().$lazy;

export default function Index() {
    const [searchText, setSearchText] = useState("");
    const [todoText, setTodoText] = useState("");
    const [showError, setShowError] = useState(false);

    // Fetch todos with SWR
    const { data: todos, mutate: mutateTodos } = useSWR(
        ["todos", searchText],
        () => getTodos({
            where: {
                text: { contains: searchText || undefined },
            },
        })
    );

    // Handle adding a new todo
    const handleAddTodo = () => {
        if (todoText.trim() === "") {
            setShowError(true);
            setTimeout(() => setShowError(false), 3000);
            return;
        }
        createTodo({
            data: { text: todoText, completed: false },
        })
            .then(() => setTodoText(""))
            .then(() => mutateTodos());
    };

    // Stream todos from other users
    const [streamedTodos, setStreamedTodos] = useState<TodoWithBy[]>([]);
    
    useAsyncIterable(
        async () => await streamTodos({ where: {} }),
        (todo) => {
            setStreamedTodos((t) => [...t, todo]);
        },
        () => {}
    );

    // Combine fetched and streamed todos
    const allTodos = useMemo(
        () => [...(todos ?? []), ...streamedTodos],
        [todos, streamedTodos]
    );

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center p-4">
            <Link to="/logout" className="absolute top-4 right-4">
                Logout
            </Link>
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl">
                <h1 className="text-4xl font-bold mb-8 text-center">
                    Todo App
                </h1>
                <TodoInput
                    todoText={todoText}
                    setTodoText={setTodoText}
                    searchText={searchText}
                    setSearchText={setSearchText}
                    handleAddTodo={handleAddTodo}
                    showError={showError}
                />
                <ul className="space-y-4">
                    {allTodos
                        ?.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
                        ?.sort((a, b) => (a.completed ? 1 : b.completed ? -1 : 0))
                        .map((todo) => (
                            <TodoItem
                                key={todo.id}
                                todo={todo}
                                mutateTodos={mutateTodos}
                            />
                        ))}
                </ul>
            </div>
        </div>
    );
}
```

### Async Iterable Hook

```typescript
// app/hooks/useAsyncGen.tsx
import { useEffect, useRef } from "react";

export function useAsyncIterable<T>(
    getIterable: () => Promise<AsyncIterable<T>>,
    onValue: (value: T) => void,
    onComplete: () => void
) {
    const iteratorRef = useRef<AsyncIterator<T> | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            const iterable = await getIterable();
            iteratorRef.current = iterable[Symbol.asyncIterator]();

            while (!cancelled) {
                const { value, done } = await iteratorRef.current.next();
                if (done || cancelled) break;
                onValue(value);
            }

            if (!cancelled) onComplete();
        })();

        return () => {
            cancelled = true;
        };
    }, []);
}
```

## Running the Example

```bash
# Clone and enter directory
cd examples/frontend/react/rr7-todo-app

# Install dependencies
bun install

# Run migrations
bunx prisma migrate dev

# Start development server
bunx cobalt dev
```

## Key Patterns

### 1. Lazy Operations

Define operations once, use multiple times:

```typescript
const getTodos = sdk.query.todos(_)().$lazy;
const createTodo = sdk.mutation.createOneTodo(_)().$lazy;
```

### 2. SWR Integration

```typescript
const { data, mutate } = useSWR(
    ["todos", searchText],
    () => getTodos({ where: { text: { contains: searchText } } })
);
```

### 3. Real-time Updates

```typescript
useAsyncIterable(
    async () => await streamTodos({ where: {} }),
    (todo) => setStreamedTodos(prev => [...prev, todo]),
    () => {}
);
```

### 4. Optimistic Updates

```typescript
const handleToggle = async (todo: Todo) => {
    // Update UI immediately
    mutateTodos(
        todos.map(t => t.id === todo.id ? { ...t, completed: !t.completed } : t),
        { revalidate: false }
    );
    
    // Then update server
    await updateTodo({
        where: { id: todo.id },
        data: { completed: !todo.completed }
    });
};
```

## Next Steps

- [With Authentication](/examples/with-auth) — Detailed auth setup
- [Getting Started](/guide/getting-started) — Start your own project
- [SDK Usage](/guide/sdk) — SDK documentation
