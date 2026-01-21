# Types & Schemas

Cobalt automatically generates GraphQL types from your TypeScript code. Understanding how this mapping works helps you design better APIs.

## Type Mapping

### Scalar Types

| TypeScript | GraphQL |
|------------|---------|
| `string` | `String!` |
| `number` | `Float!` |
| `boolean` | `Boolean!` |
| `Date` | `DateTime!` |

### Nullable Types

| TypeScript | GraphQL |
|------------|---------|
| `string \| null` | `String` |
| `string \| undefined` | `String` |
| `string?` | `String` |

### Arrays

| TypeScript | GraphQL |
|------------|---------|
| `string[]` | `[String]!` |
| `(string \| null)[]` | `[String]!` |
| `string[] \| null` | `[String]` |
<!-- | TypeScript | GraphQL |
|------------|---------|
| `string[]` | `[String!]!` |
| `(string \| null)[]` | `[String]!` |
| `string[] \| null` | `[String!]` | -->

## Object Types

Object return types become GraphQL object types:

```typescript
export function Query() {
    return {
        id: "1",
        name: "John",
        age: 30
    };
}
// Generates:
// type QueryResult {
//   id: String!
//   name: String!
//   age: Float!
// }
```

## Custom Type Names

Override generated type names with `__typename`:

```typescript
export function Query() {
    return {
        id: "1",
        name: "John",
        email: "john@example.com"
    };
}

export const __typename = "User";

// Generates:
// type User {
//   id: String!
//   name: String!
//   email: String!
// }
```

## Input Types

Function parameters become GraphQL input types:

```typescript
type CreateUserInput = {
    name: string;
    email: string;
    age?: number;
};

export function Mutation(data: CreateUserInput) {
    return createUser(data);
}

// Generates:
// input CreateUserInput {
//   name: String!
//   email: String!
//   age: Int
// }
```

## Nested Types

Nested objects create nested types:

```typescript
export function Query() {
    return {
        user: {
            id: "1",
            name: "John",
            address: {
                street: "123 Main St",
                city: "New York"
            }
        }
    };
}

// Generates:
// type QueryResult {
//   user: UserType!
// }
// type UserType {
//   id: String!
//   name: String!
//   address: AddressType!
// }
// type AddressType {
//   street: String!
//   city: String!
// }
```

## Extended Types

Extend types that have been annotated with `export const __typename = "..."` in an operation file with additional fields. 

Create extended type files in `server/types/<__typename>.ts`:

Use the `$$root.<__typename>(this)` helper to access the a typed root object. You have to select the correct type name yourself.

```typescript
// server/types/User.ts
export function email() {
    const { name } = $$root.User(this);
    return `${name}@example.com`;
}

// server/operations/getUser.ts
export function Query(id: string) {
    return {
        id,
        name: "John"
    };
}

export const __typename = "User";
```

This will be automatically added to the GraphQL schema as a field of the type `User`.

```graphql
# schema.graphql
type User {
  id: String!
  name: String!
  email: String!
}
```

## Prisma Integration

Use Prisma types directly:

```typescript
import { Prisma } from "../../prisma/generated/client/client";

export async function Query(
    where?: Omit<Prisma.UserWhereInput, "AND" | "OR" | "NOT">
) {
    const { prisma } = $$ctx(this);
    return prisma.user.findMany({ where });
}
```

## Inference Rules

### Numbers

Since Cobalt cannot infere if a number is an integer or a float, it will always return a `Float` type.

```typescript
export function Query() {
    return 42;  // Float!
}
```

```typescript
export function Query() {
    return 3.14;  // Float!
}
```

### Optional vs Required

```typescript
// Required field
export function Query() {
    return { name: "John" };  // name: String!
}

// Optional with undefined
export function Query() {
    return { name: undefined as string | undefined };  // name: String
}

// Optional with null
export function Query() {
    return { name: null as string | null };  // name: String
}
```

### Complex Examples

```typescript
// Mixed types
export function Query() {
    return {
        id: "1",                        // String
        count: 42,                      // Float!
        rating: 4.5,                    // Float!
        active: true,                   // Boolean!
        tags: ["a", "b"],               // [String!]!
        metadata: null as any | null,   // JSON
        items: [                        // [ItemType]!
            { name: "Item 1", qty: 1 },
            { name: "Item 2", qty: 2 }
        ]
    };
}
```

## Type Resolution

When Cobalt can't infer a type, you'll get a warning in the console and the type will be inferred as `any`.
You can always use explicit TypeScript types to fix the warning.

Most of the time this happens because some file is not being imported correctly. And in fact has an undefined type.

```typescript
type Result = {
    id: string;
    data: Record<string, unknown>;
    timestamp: Date;
};

export function Query(): Result {
    return {
        id: "1",
        data: { foo: "bar" },
        timestamp: new Date()
    };
}
```

## JSDoc Comments

You can add JSDoc comments to your code and it will be added to the GraphQL schema as a description of the field.

```typescript
// server/operations/foobar.ts
/**
 * Some description of the query
 */
export function Query() {
    return {
        id: "1",
        data: { foo: "bar" },
        timestamp: new Date()
    };
}
```

```graphql
# schema.graphql
type Query {
  """
  Some description of the query
  """
  foobar: FoobarType!
}
```

## Best Practices

### 1. Define Shared Types

```typescript
// server/@types/index.ts
export type Pagination = {
    total: number;
    page: number;
    perPage: number;
    hasMore: boolean;
};

export type PaginatedResult<T> = {
    items: T[];
    pagination: Pagination;
};
```

### 2. Use Consistent Naming

```typescript
// ✅ Good - consistent __typename usage
export const __typename = "User";
export const __typename = "Post";
export const __typename = "Comment";

// ❌ Avoid - inconsistent
export const __typename = "UserData";
export const __typename = "post_type";
export const __typename = "CommentResult";
```

## Next Steps

- [Enums](/guide/enums) — Working with enum types
- [Union Types](/guide/unions) — Handling polymorphic types
- [Nested Objects](/guide/nested-objects) — Complex object structures
