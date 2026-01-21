# Nested Objects

Cobalt supports deeply nested object structures with full type inference. This guide covers best practices for working with nested data.

## Basic Nesting

Return nested objects from your operations:

```typescript
export function Query() {
    return {
        user: {
            name: "John",
            address: {
                street: "123 Main St",
                city: "New York"
            }
        }
    };
}
```

Usage:

```typescript
const result = await sdk.query.userInfo();

console.log(result.user.name);              // "John"
console.log(result.user.address.street);    // "123 Main St"
console.log(result.user.address.city);      // "New York"
```

## Deep Nesting

Cobalt handles any level of nesting:

```typescript
export function Query() {
    return {
        organization: {
            name: "Acme Corp",
            departments: {
                engineering: {
                    teams: {
                        frontend: {
                            lead: "Alice",
                            members: ["Bob", "Charlie"]
                        }
                    }
                }
            }
        }
    };
}
```

## Field Selection for Nested Objects

Select specific fields from nested structures:

```typescript
const result = await sdk.query.userInfo()(
    ({ user }) => ({
        user: user(({ name, address }) => ({
            name,
            address: address(({ city }) => ({ city }))
        }))
    })
);

// Result: { user: { name: "John", address: { city: "New York" } } }
```

See the [Field Selection](/guide/field-selection) guide for more details.

## Nested Arrays

Objects can contain arrays of nested objects:

```typescript
export function Query() {
    return {
        team: {
            name: "Engineering",
            members: [
                {
                    id: "1",
                    name: "Alice",
                    skills: ["TypeScript", "React"]
                },
                {
                    id: "2",
                    name: "Bob",
                    skills: ["Node.js", "PostgreSQL"]
                }
            ]
        }
    };
}
```

Selection:

```typescript
const result = await sdk.query.teamInfo()(
    ({ team }) => ({
        team: team(({ name, members }) => ({
            name,
            members: members(({ id, name }) => ({ id, name }))
        }))
    })
);
```

See the [Field Selection](/guide/field-selection) guide for more details.

<!-- ## Custom Type Names for Nested Types

Use `__typename` to name your types:

```typescript
export function Query() {
    return {
        user: {
            id: "1",
            name: "John",
            profile: {
                avatar: "https://...",
                bio: "Developer"
            }
        }
    };
}

export const __typename = "UserWithProfile";
``` -->

## Nullable Nested Objects

Handle optional nested data:

```typescript
type User = {
    id: string;
    name: string;
    profile: {
        avatar: string;
        bio: string;
    } | null;
};

export async function Query(id: string): Promise<User> {
    const user = await getUser(id);
    
    return {
        id: user.id,
        name: user.name,
        profile: user.hasProfile ? {
            avatar: user.avatar,
            bio: user.bio
        } : null
    };
}
```

## Complex Nested Structures

Real-world example with Prisma:

```typescript
export async function Query(id: string) {
    const { prisma } = $$ctx(this);
    
    const order = await prisma.order.findUnique({
        where: { id },
        include: {
            customer: {
                include: {
                    address: true
                }
            },
            items: {
                include: {
                    product: {
                        include: {
                            category: true
                        }
                    }
                }
            },
            shipping: true
        }
    });
    
    return order;
}
```

Frontend query:

```typescript
const order = await sdk.query.order({ id: "order-123" })(
    ({ customer, items, shipping }) => ({
        customer: customer(({ name, address }) => ({
            name,
            address: address(({ city }) => ({ city }))
        })),
        items: items(({ quantity, product }) => ({
            quantity,
            product: product(({ name, price, category }) => ({
                name, price, category: category(({ name }) => ({ name })) 
            }))
        })),
        shipping: shipping(({ status, trackingNumber }) => ({
            status,
            trackingNumber
        }))
    })
);
```

## With $lazy Pattern

```typescript
import sdk, { _ } from "sdk";

const getOrderDetails = sdk.query.order({ id: _ })(
    ({ customer, items }) => ({
        customer: customer(({ name }) => ({ name })),
        items: items(({ quantity, product }) => ({
            quantity,
            product: product(({ name, price, category }) => ({
                name, price, category: category(({ name }) => ({ name }))
            }))
        }))
    })
).$lazy;

// Use later
const order = await getOrderDetails({ id: "order-123" });
```

## Best Practices

### 1. Avoid Excessive Nesting

```typescript
// ✅ Good - reasonable depth
return {
    user: {
        profile: {
            settings: { theme: "dark" }
        }
    }
};

// ⚠️ Consider flattening
return {
    a: { b: { c: { d: { e: { f: "too deep" } } } } }
};
```

### 2. Use Type Definitions

```typescript
// ✅ Good - defined types
type OrderItem = {
    product: Product;
    quantity: number;
    price: number;
};

type Order = {
    id: string;
    items: OrderItem[];
    total: number;
};

export function Query(): Order {
    // ...
}
```

### 3. Select Only What You Need

```typescript
// ✅ Good - select specific fields
const user = await sdk.query.user({ id })(
    ({ name, email }) => ({ name, email })
);

// ❌ Avoid - fetching everything
const user = await sdk.query.user({ id })();
```

## Next Steps

- [Lists & Arrays](/guide/lists) — Working with collections
- [Field Selection](/guide/field-selection) — Selecting nested fields
- [Types & Schemas](/guide/types) — Type definitions
