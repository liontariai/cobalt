# Lists & Arrays

Cobalt supports arrays of any type - scalars, objects, or even nested arrays. This guide covers working with list types.

## Scalar Arrays

Return arrays of primitive types:

```typescript
// Array of strings
export function Query() {
    return ["Hello", "World", "!"];
}

// Array of numbers
export function Query() {
    return [1, 2, 3, 4, 5];
}

// Array of booleans
export function Query() {
    return [true, false, true];
}
```

## Object Arrays

Return arrays of objects:

```typescript
export function Query() {
    return [
        { name: "Person 1", age: 10 },
        { name: "Person 2", age: 20 },
        { name: "Person 3", age: 30 }
    ];
}
```

Usage:

```typescript
const people = await sdk.query.people();

people.forEach(person => {
    console.log(`${person.name}: ${person.age}`);
});
```

## Arrays with Arguments

```typescript
type FilterInput = {
    minAge?: number;
    maxAge?: number;
};

export function Query(filter: FilterInput) {
    const people = getAllPeople();
    
    return people.filter(p => {
        if (filter.minAge && p.age < filter.minAge) return false;
        if (filter.maxAge && p.age > filter.maxAge) return false;
        return true;
    });
}
```

## Field Selection on Arrays

Select specific fields from array items:

```typescript
const people = await sdk.query.people()(
    ({ name, age }) => ({ name, age })
);

// Each item has only name and age
```

## Input Arrays

Accept arrays as arguments:

```typescript
// Simple array input
export function Query(tags: string[]) {
    return findByTags(tags);
}

// Array of objects
type PersonInput = {
    name: string;
    age: number;
};

export function Mutation(people: PersonInput[]) {
    return createPeople(people);
}
```

Usage:

```typescript
// String array
const results = await sdk.query.byTags({ tags: ["typescript", "graphql"] });

// Object array
const created = await sdk.mutation.createPeople({
    people: [
        { name: "Alice", age: 25 },
        { name: "Bob", age: 30 }
    ]
})();
```

## Nested Arrays

Arrays can contain nested arrays:

```typescript
export function Query() {
    return {
        matrix: [
            [1, 2, 3],
            [4, 5, 6],
            [7, 8, 9]
        ]
    };
}
```

## Arrays in Nested Objects

```typescript
export function Query() {
    return {
        team: {
            name: "Engineering",
            members: [
                {
                    id: "1",
                    name: "Alice",
                    skills: ["TypeScript", "React", "Node.js"]
                },
                {
                    id: "2",
                    name: "Bob",
                    skills: ["Python", "Django"]
                }
            ]
        }
    };
}
```

Selection:

```typescript
const team = await sdk.query.teamInfo()(
    ({ team }) => ({
        team: team(({ name, members }) => ({
            name,
            members: members(({ name, skills }) => ({ name, skills }))
        }))
    })
);
```

## Nullable Arrays

Different nullable patterns:

```typescript
// Nullable array
export function Query(): string[] | null {
    return null;  // GraphQL: [String!]
}

// Array with nullable items
export function Query(): (string | null)[] {
    return ["a", null, "c"];  // GraphQL: [String]!
}

// Both nullable
export function Query(): (string | null)[] | null {
    return null;  // GraphQL: [String]
}
```

## Pagination

Common pagination pattern:

```typescript
type PaginationInput = {
    page: number;
    perPage: number;
};

type PaginatedResult<T> = {
    items: T[];
    total: number;
    page: number;
    perPage: number;
    hasMore: boolean;
};

export async function Query(
    pagination: PaginationInput
): Promise<PaginatedResult<User>> {
    const { prisma } = $$ctx(this);
    
    const [items, total] = await Promise.all([
        prisma.user.findMany({
            skip: (pagination.page - 1) * pagination.perPage,
            take: pagination.perPage
        }),
        prisma.user.count()
    ]);
    
    return {
        items,
        total,
        page: pagination.page,
        perPage: pagination.perPage,
        hasMore: pagination.page * pagination.perPage < total
    };
}
```

### Clever Usage With `$lazy`

```typescript
import sdk, { _ } from "sdk";

const paginate = sdk.query.pagination({ page: _, perPage: 40 })().$lazy;

// the `perPage` argument is already set to 40,
// so we don't need to pass it again when calling the function
const page1 = await paginate({ page: 1 });
const page2 = await paginate({ page: 2 });
const page3 = await paginate({ page: 3 });

console.log(page1.items);
console.log(page2.items);
console.log(page3.items);
```

## Cursor-Based Pagination

```typescript
type CursorInput = {
    cursor?: string;
    take: number;
};

export async function Query(input: CursorInput) {
    const { prisma } = $$ctx(this);
    
    const items = await prisma.post.findMany({
        take: input.take + 1,  // Fetch one extra to check hasMore
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : 0
    });
    
    const hasMore = items.length > input.take;
    if (hasMore) items.pop();
    
    return {
        items,
        hasMore,
        nextCursor: hasMore ? items[items.length - 1].id : null
    };
}
```

### Clever Usage With `$lazy`
```typescript
import sdk, { _ } from "sdk";

const cursorPaginate = sdk.query.cursorPagination({ cursor: _, take: 40 })().$lazy;

// the `take` argument is already set to 40,
// so we don't need to pass it again when calling the function
const page1 = await cursorPaginate({ cursor: "0" });
const page2 = await cursorPaginate({ cursor: "40" });
const page3 = await cursorPaginate({ cursor: "80" });
```

## With $lazy Pattern

```typescript
import sdk, { _ } from "sdk";

const getUsers = sdk.query.users(_)().$lazy;

// Get all users
const allUsers = await getUsers({});

// Get filtered users
const activeUsers = await getUsers({
    where: { status: "ACTIVE" }
});
```

## Real-World Example

From the Todo app:

```typescript
// server/operations/todos.ts
export async function Query(
    where?: Omit<Prisma.TodoWhereInput, "AND" | "OR" | "NOT" | "ownerId">
) {
    const { prisma } = $$ctx(this);
    const { token } = $$auth(this);
    const { email } = token.subject.properties;

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

Frontend usage:

```typescript
const getTodos = sdk.query.todos(_)().$lazy;

const todos = await getTodos({
    where: {
        text: { contains: searchText || undefined }
    }
});

// Sort and display
const sortedTodos = todos
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .sort((a, b) => (a.completed ? 1 : b.completed ? -1 : 0));
```

## Best Practices

### 1. Always Paginate Large Lists

```typescript
// ✅ Good - paginated
export function Query(page: number, perPage: number) {
    return prisma.user.findMany({
        skip: (page - 1) * perPage,
        take: perPage
    });
}

// ❌ Avoid - returns all
export function Query() {
    return prisma.user.findMany();  // Could be millions
}
```

### 2. Provide Sensible Defaults

```typescript
export function Query(
    take: number = 20,  // Default limit
    skip: number = 0
) {
    return prisma.item.findMany({ take, skip });
}
```

### 3. Include Total Count When Paginating

```typescript
export async function Query(page: number, perPage: number) {
    const [items, total] = await Promise.all([
        prisma.user.findMany({ skip: (page - 1) * perPage, take: perPage }),
        prisma.user.count()
    ]);
    
    return { items, total, page, perPage };
}
```

### 4. Use Field Selection

```typescript
// ✅ Good - select only needed fields
const users = await sdk.query.users()(
    ({ id, name }) => ({ id, name })
);

// ❌ Avoid - fetch everything for each item
const users = await sdk.query.users()();
```

## Next Steps

- [Nested Objects](/guide/nested-objects) — Complex object structures
- [Field Selection](/guide/field-selection) — Selecting array item fields
- [Queries](/guide/queries) — Query patterns
