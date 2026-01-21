# Field Selection

Field selection allows you to control exactly which fields are returned from your queries. This is one of the key benefits of GraphQL, and Cobalt's SDK makes it type-safe and intuitive.

## Basic Selection

When a query returns an object type, you can select fields using a selector function:

```typescript
// Select all fields (default)
const user = await sdk.query.user({ id: "123" })();

// Select specific fields
const user = await sdk.query.user({ id: "123" })(
    ({ id, name, email }) => ({ id, name, email })
);
```

## How It Works

The selector function receives a "selections" object with all available fields. You destructure what you need and return them:

```typescript
const user = await sdk.query.user({ id: "123" })(
    // This function receives all available fields
    ({ id, name, email, createdAt, profile }) => {
        // Return only what you need
        return { id, name };
    }
);
// Result: { id: "123", name: "John" }
```

## Nested Selection

For nested objects, chain the selection:

```typescript
const user = await sdk.query.user({ id: "123" })(
    ({ id, name, profile }) => ({
        id,
        name,
        profile: profile(({ avatar, bio }) => ({
            avatar,
            bio
        }))
    })
);
// Result: { id: "123", name: "John", profile: { avatar: "...", bio: "..." } }
```

## Deep Nesting

Handle deeply nested structures:

```typescript
const user = await sdk.query.user({ id: "123" })(
    ({ id, profile }) => ({
        id,
        profile: profile(({ settings }) => ({
            settings: settings(({ theme, notifications }) => ({
                theme,
                notifications: notifications(({ email, push }) => ({
                    email,
                    push
                }))
            }))
        }))
    })
);
```

## Deep Nesting With Partial Field Selection

You can also use the `$all` selector (omit the selector function) to select all fields in a nested object.

```typescript
const user = await sdk.query.user({ id: "123" })(
    ({ id, profile }) => ({
        id,
        profile: profile(({ settings }) => ({
            settings: settings(({ theme, notifications }) => ({
                theme,
                notifications: notifications() // Select all notifications fields
            }))
        }))
    })
);
```

## Lists

When a field returns a list, the selector applies to each item:

```typescript
const users = await sdk.query.users()(
    ({ id, name }) => ({ id, name })
);
// Result: [{ id: "1", name: "John" }, { id: "2", name: "Jane" }]
```

## Nested Lists

```typescript
const teams = await sdk.query.teams()(
    ({ id, name, members }) => ({
        id,
        name,
        members: members() // Select all members fields
    })
);
// Result: [
//   { id: "1", name: "Engineering", members: [{ id: "...", name: "...", role: "..." }] }
// ]
```

## The `$all` Selector

You can use the magic `$all` selector to select all fields in an object or list.
This recursively selects all fields in the object or list and excludes cyclic references by default, when you simply omit the selector function.

```typescript
const user = await sdk.query.user({ id: "123" })();
// Returns all scalar fields (strings, numbers, booleans) and nested objects or lists automatically
```

You can also use the magic `$all` selector explicitly to select all fields in an object or list and `exclude` some paths.

```typescript
const user = await sdk.query.user({ id: "123" })(
    (s) => s.$all({ exclude: ["profile.settings.notifications.email"] })
);
// Returns all scalar fields (strings, numbers, booleans) and nested objects or lists automatically, but excludes the email field in the notifications object in the profile settings object
```

You can also use the magic `$all` selector explicitly to select all fields in an object or list even when there are cyclic references.

With `cyclic` you can choose from `"select cyclic levels: 1 | 2 | 3 | 4 | 5"` to select the depth of the cyclic references you want to include.

```typescript
const user = await sdk.query.user({ id: "123" })(
    (s) => s.$all({
        cyclic: {
            "teams.members.user": "select cyclic levels: 2" // this is a type-safe string literal, you can choose from "select cyclic levels: 1 | 2 | 3 | 4 | 5"
        }
    })
);
// Returns all scalar fields (strings, numbers, booleans) and nested objects or lists automatically, but includes the user object in the members object in the teams object up to a depth of 2
```



## Aliasing

Give fields custom names in the result.

This will also be translated to the GraphQL query sent to the server.

```typescript
const result = await sdk.query.user({ id: "123" })(
    ({ id, name, email }) => ({
        id,
        userName: name,       // Aliased
        userEmail: email      // Aliased
    })
);
// Result: { id: "123", userName: "John", userEmail: "john@example.com" }
```

<!-- ## Computed, Local Fields

You can co-locate local data in fields. This is useful for computed values or for adding additional data to the result that is not part of the GraphQL schema.
This is not sent to the server, it is only included in the result. View it as some static data you're adding to the result.

```typescript
const result = await sdk.query.user({ id: "123" })(
    ({ id, firstName, lastName }) => ({
        id,
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`
    })
);
``` -->

## Conditional Selection

Select different fields based on conditions:

```typescript
const getUser = (includeProfile: boolean) => {
    return sdk.query.user({ id: "123" })(
        ({ id, name, profile }) => ({
            id,
            name,
            profile: includeProfile ? profile(({ avatar }) => ({ avatar })) : undefined
        })
    );
};
```

<!-- ## Use $fragment to reuse selection

You can use the `$fragment` selector to reuse selection.

```typescript
const user = await sdk.query.user({ id: "123" })(
    ({ id, name }) => ({ id, name })
);
``` -->

## Type Safety

Field selection is fully type-safe:

```typescript
const user = await sdk.query.user({ id: "123" })(
    ({ id, name }) => ({ id, name })
);

// ✅ These work
console.log(user.id);
console.log(user.name);

// ❌ Type error - email wasn't selected
console.log(user.email);  // Property 'email' does not exist
```

## Union Types

For union types, use the `$on` selector:

```typescript
const result = await sdk.query.searchResult()(
    ({ $on }) => ({
        ...$on.User(({ id, name }) => ({ id, name })),
        ...$on.Post(({ id, title }) => ({ id, title })),
    })
);
```

See the [Union Types](/guide/unions) guide for more details.

## Performance Benefits

Field selection reduces network payload:

```typescript
// ❌ Fetches all 20 fields
const user = await sdk.query.user({ id: "123" })();

// ✅ Fetches only 2 fields
const user = await sdk.query.user({ id: "123" })(
    ({ id, name }) => ({ id, name })
);
```

## Best Practices

### 1. Select What You Need

```typescript
// ✅ Good - only fetch what's displayed
const listUsers = sdk.query.users()(
    ({ id, name, avatar }) => ({ id, name, avatar })
).$lazy;

// ❌ Avoid - fetching everything
const listUsers = sdk.query.users()().$lazy;
```

<!-- ### 2. Create Purpose-Specific Queries

```typescript
// For list view - minimal data
const getUsersForList = sdk.query.users()(
    ({ id, name }) => ({ id, name })
).$lazy;

// For detail view - more data
const getUserDetail = sdk.query.user({ id: _ })(
    ({ id, name, email, profile, posts }) => ({
        id, name, email,
        profile: profile(({ avatar, bio }) => ({ avatar, bio })),
        posts: posts(({ id, title }) => ({ id, title }))
    })
).$lazy;
``` -->

### 2. Avoid Over-Nesting

```typescript
// ✅ Good - reasonable depth
const result = await sdk.query.user({ id: "123" })(
    ({ id, profile }) => ({
        id,
        profile: profile(({ avatar }) => ({ avatar }))
    })
);

// ⚠️ Consider if you really need this depth
const result = await sdk.query.user({ id: "123" })(
    ({ organization }) => ({
        organization: organization(({ settings }) => ({
            settings: settings(({ features }) => ({
                features: features(({ config }) => ({
                    config: config(/* ... */)
                }))
            }))
        }))
    })
);
```

## Next Steps

- [The $lazy Pattern](/guide/lazy-pattern) — Reusable operations
- [SDK Usage](/guide/sdk) — Full SDK documentation
- [Union Types](/guide/unions) — Handling union selections
