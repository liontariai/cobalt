# Union Types

Union types allow a field to return one of several possible types.

Beside GraphQL unions, Cobalt supports custom scalar unions for unions of scalar types or for input types, which is not natively supported by GraphQL.

## Custom Scalar Unions

For simple unions of scalar types, Cobalt creates custom scalars:

```typescript
type StringOrNumber = string | number;

export function Query(): StringOrNumber {
    return Math.random() > 0.5 ? "hello" : 42;
}
```

Usage:

```typescript
const result = await sdk.query.value;
// result is string | number
```

## GraphQL Union Types

For unions of object types, Cobalt creates proper GraphQL unions:

```typescript
type SearchResult =
    | { title: string; description: string }
    | { url: string };

export function Query(): SearchResult {
    return {
        title: "Hello, World!",
        description: "This is a test"
    };
}
```

### Resolve Type Function

For union types, you must provide a `resolveType` function to help GraphQL determine the concrete type.

To make your life easier, Cobalt will generate a resolveType function for you and add it to the operation file.
The generated resolveType function will be fully typed and will help you to discriminate the union type.

You'll have to provide the proper logic, so the given resolveType funtion's type definition matches the actual logic.

```typescript
import type { $$types } from "../.types/unions.$$types";

type SearchResult =
    | { title: string; description: string }
    | { url: string };

export function Query(): SearchResult {
    return {
        title: "Hello, World!",
        description: "This is a test"
    };
}

// Resolve the union type
Query.resolveType = (
    value: import("$$types").Unions["SearchResultUnion"]
): import("$$types").UnionsResolveToTypename["SearchResultUnion"] => {
    if ("url" in value) {
        return "SearchResultWithUrl";
    }
    return "SearchResultWithTitleAndDescription";
};
```

## Querying Union Types On The Client Side

Use the `$on` selector to handle different union members:

```typescript
const result = await sdk.query.searchResult(({ $on }) => ({
    ...$on._title_string_description_string_(({ title, description }) => ({
        title,
        description
    })),
    ...$on._url_string_(({ url }) => ({
        url
    }))
}));
```

### With Aliasing

You can use aliasing to aggregate the union members into a single object.

This is not easily possible with raw GraphQL. The Samarium SDK solves this by prepending your alias name to the subselection's field names in the query sent to the server.

After retrieving the result, you can access the union members via the aliases you've defined.

```typescript
const result = await sdk.query.searchResult(({ $on }) => ({
    article: $on._title_string_description_string_(({ title }) => ({ title })),
    link: $on._url_string_(({ url }) => ({ url }))
}));

// Access via aliases
console.log(result.article?.title);
console.log(result.link?.url);
```

#### Aliasing With `$all`

You can use the magic `$all` selector to aggregate all fields of the union members into separate objects.

```typescript
const result = await sdk.query.searchResult(({ $on }) => ({
    article: $on._title_string_description_string_(),
    link: $on._url_string_(),
}));
```

## Union with Arguments

```typescript
type SearchResult =
    | { title: string; description: string }
    | { url: string };

export function Query(returnUrl: boolean): SearchResult {
    if (returnUrl) {
        return { url: "https://www.google.com" };
    }
    return {
        title: "Hello, World!",
        description: "This is a test"
    };
}

Query.resolveType = (value: import("$$types").Unions["SearchResultUnion"]): import("$$types").UnionsResolveToTypename["SearchResultUnion"] => {
    if ("url" in value) return "_url_string_";
    return "_title_string_description_string_";
};
```

Usage:

```typescript
// Get URL result
const urlResult = await sdk.query.search({ returnUrl: true })(({ $on }) => ({
    ...$on._url_string_(({ url }) => ({ url }))
}));

// Get title result
const titleResult = await sdk.query.search({ returnUrl: false })(({ $on }) => ({
    ...$on._title_string_description_string_(({ title, description }) => ({
        title,
        description
    }))
}));
```

## Nested Union Types

Handle unions inside objects:

```typescript
type Event =
    | { type: "click"; x: number; y: number }
    | { type: "scroll"; position: number }
    | { type: "mouseover"; element: string };

export function Query() {
    return {
        id: "1",
        event: { type: "click", x: 100, y: 200 } as Event
    };
}
```

Query nested unions:

```typescript
const result = await sdk.query.eventLog(({ id, event }) => ({
    id,
    event: event(({ $on }) => ({
        ...$on._type_click_(({ x, y }) => ({ x, y })),
        ...$on._type_scroll_(({ position }) => ({ position })),
        ...$on._type_mouseover_(({ element }) => ({ element }))
    }))
}));
```

Or use the `$all` selector:

```typescript
const result = await sdk.query.eventLog(({ id, event }) => ({
    id,
    event: event(({ $on }) => ({
        ...$on._type_click(),
        ...$on._type_scroll(),
        ...$on._type_mouseover(),
    }))
}));
```

## Union with $lazy

```typescript
import sdk, { _ } from "sdk";

const getSearchResult = sdk.query.search({ returnUrl: _ })(({ $on }) => ({
    ...$on._url_string_(({ url }) => ({ url })),
    ...$on._title_string_description_string_(({ title }) => ({ title }))
})).$lazy;

// Use later
const result = await getSearchResult({ returnUrl: true });
```

## Input Unions

Use discriminated unions for input types:

```typescript
type EventInput =
    | { event: "click"; payload: string }
    | { event: "scroll"; payload: number }
    | { event: "mouseover"; payload: boolean };

export function Query(input: EventInput) {
    return {
        value: input
    };
}
```

Usage:

```typescript
const result = await sdk.query.processEvent({
    input: { event: "click", payload: "button-id" }
})(({ value }) => ({
    value: value(({ $on }) => ({
        ...$on._event_click_payload_string_(({ event, payload }) => ({
            event,
            payload
        }))
    }))
}));
```

## Complete Example

```typescript
// server/operations/search.ts
import type { $$types } from "../.types/search.$$types";

type User = {
    id: string;
    name: string;
    email: string;
};

type Post = {
    id: string;
    title: string;
    content: string;
};

type SearchResult = User | Post;

export async function Query(
    query: string,
    type?: "user" | "post"
): Promise<SearchResult[]> {
    const { prisma } = $$ctx(this);
    
    if (type === "user") {
        return prisma.user.findMany({
            where: { name: { contains: query } }
        });
    }
    
    if (type === "post") {
        return prisma.post.findMany({
            where: { title: { contains: query } }
        });
    }
    
    // Search both
    const [users, posts] = await Promise.all([
        prisma.user.findMany({ where: { name: { contains: query } } }),
        prisma.post.findMany({ where: { title: { contains: query } } })
    ]);
    
    return [...users, ...posts];
}

Query.resolveType = (value: import("$$types").Unions["SearchResultUnion"]): import("$$types").UnionsResolveToTypename["SearchResultUnion"] => {
    if ("email" in value) return "User";
    return "Post";
};
```

Frontend usage:

```typescript
const results = await sdk.query.search({ query: "john" })(({ $on }) => ({
    ....$on.User(({ id, name, email }) => ({
        id,
        name,
        email
    })),
    ...$on.Post(({ id, title }) => ({
        id,
        title
    }))
}));
```
<!-- ```typescript
const results = await sdk.query.search({ query: "john" })(({ $on }) => ({
    ....$on.User(({ id, name, email }) => ({
        id,
        name,
        email
    })),
    ...$on.Post(({ id, title }) => ({
        id,
        title
    }))
}));

// Handle results
results.forEach(result => {
    if (result.type === "user") {
        console.log(`User: ${result.name} (${result.email})`);
    } else {
        console.log(`Post: ${result.title}`);
    }
});
``` -->

## Best Practices

### 1. Always Implement resolveType

```typescript
// ✅ Required for object unions
Query.resolveType = (value: import("$$types").Unions["UnionName"]): import("$$types").UnionsResolveToTypename["UnionName"] => {
    // Use discriminating property
    if ("email" in value) return "User";
    return "Post";
};
```

### 2. Use Discriminated Unions

```typescript
// ✅ Good - easy to discriminate
type Result =
    | { kind: "success"; data: string }
    | { kind: "error"; message: string };

// ❌ Harder to discriminate
type Result =
    | { data: string }
    | { message: string };
```

## Next Steps

- [Types & Schemas](/guide/types) — Complete type reference
- [Enums](/guide/enums) — Enum types
- [Field Selection](/guide/field-selection) — Selecting union fields
