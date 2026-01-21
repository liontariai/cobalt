# Enums

Enums provide a way to define a set of named constants. Cobalt automatically converts TypeScript literal union types into GraphQL enums.

## Defining Enums

Use TypeScript literal unions to create GraphQL enums:

```typescript
// server/operations/color.ts
export function Query() {
    return "RED" as const;
}
```

This generates:

```graphql
# schema.graphql
enum Color {
  RED
}

type Query {
  color: Color!
}
```

## Enum Return Types

```typescript
// server/operations/status.ts
type Status = "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export function Query(): Status {
    return "ACTIVE";
}
```

Generated GraphQL:

```graphql
# schema.graphql
enum Status {
  PENDING
  ACTIVE
  COMPLETED
  CANCELLED
}
```

## Enum Arguments

Use enums as function parameters:

```typescript
// server/operations/color.ts
type Color = "RED" | "GREEN" | "BLUE";

export function Query(color: Color) {
    return `Selected: ${color}`;
}
```

Usage:

```typescript
const result = await sdk.query.selectColor({ color: "RED" });
// => "Selected: RED"
```

## Enums in Objects

Include enums in object types:

```typescript
// server/operations/priority.ts
type Priority = "LOW" | "MEDIUM" | "HIGH";

export function Query() {
    return {
        id: "task-1",
        title: "Important Task",
        priority: "HIGH" as Priority
    };
}
```

## Enums with $lazy

```typescript
import sdk, { _ } from "sdk";

const getByStatus = sdk.query.tasksByStatus({ status: _ })().$lazy;

// Use with enum value
const pendingTasks = await getByStatus({ status: "PENDING" }); // will autocomplete with "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED"
const activeTasks = await getByStatus({ status: "ACTIVE" }); // will autocomplete with "PENDING" | "ACTIVE" | "COMPLETED" | "CANCELLED"
```

## Dynamic Enum Values

Return different enum values based on logic:

```typescript
// server/operations/trafficLight.ts

// explicitly typed enum
type TrafficLight = "RED" | "YELLOW" | "GREEN";

export function Query(time: number): TrafficLight {
    if (time < 30) return "GREEN";
    if (time < 35) return "YELLOW";
    return "RED";
}
```

```typescript
// server/operations/trafficLight.ts

// implicitly typed enum
export function Query(time: number) {
    if (time < 30) return "GREEN" as const;
    if (time < 35) return "YELLOW" as const;
    return "RED" as const;
}
```

## Enum Arrays

Return arrays of enum values:

```typescript
// server/operations/permissions.ts

// explicitly typed enum
type Permission = "READ" | "WRITE" | "DELETE" | "ADMIN";
export function Query(userId: string): Permission[] {
    // Return user's permissions
    return ["READ", "WRITE"] as const;
}
```
```typescript
// server/operations/permissions.ts

// implicitly typed enum
export function Query(userId: string) {
    // Return user's permissions
    return ["READ", "WRITE"] as const;
}
```

## Enums in Input Types

Use enums in complex input types:

```typescript
type SortOrder = "ASC" | "DESC";
type SortField = "NAME" | "DATE" | "PRIORITY";

type SortInput = {
    field: SortField;
    order: SortOrder;
};

export function Query(sort: SortInput) {
    return database.tasks.findMany({
        orderBy: {
            [sort.field.toLowerCase()]: sort.order.toLowerCase()
        }
    });
}
```

## Complete Example

```typescript
// server/operations/tasks.ts
type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type Task = {
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
};

type TaskFilter = {
    status?: TaskStatus;
    priority?: TaskPriority;
};

export async function Query(filter?: TaskFilter): Promise<Task[]> {
    const { prisma } = $$ctx(this);
    
    return prisma.task.findMany({
        where: {
            status: filter?.status,
            priority: filter?.priority
        }
    });
}
```

Frontend usage:

```typescript
// Get high priority tasks
const urgentTasks = await sdk.query.tasks({
    filter: {
        priority: "HIGH"
    }
})();

// Get tasks in review
const reviewTasks = await sdk.query.tasks({
    filter: {
        status: "REVIEW"
    }
})();
```

## Type Safety

The SDK provides full enum type safety:

```typescript
// ✅ Valid enum values
await sdk.query.selectColor({ color: "RED" });
await sdk.query.selectColor({ color: "GREEN" });
await sdk.query.selectColor({ color: "BLUE" });

// ❌ Type error - invalid enum value
await sdk.query.selectColor({ color: "PURPLE" });
// Type error: Argument of type '"PURPLE"' is not assignable to 
// parameter of type '"RED" | "GREEN" | "BLUE"'
```

## Enum Naming

Cobalt infers enum names from usage. For explicit naming, use type definitions:

```typescript
// Explicitly named enum type
type UserRole = "ADMIN" | "MODERATOR" | "USER" | "GUEST";

export function Query(): { role: UserRole } {
    return { role: "USER" };
}

export const __typename = "UserInfo";
```

## Best Practices

### 1. Use UPPERCASE for Enum Values

```typescript
// ✅ Good - uppercase values (GraphQL convention)
type Status = "PENDING" | "ACTIVE" | "COMPLETED";

// ❌ Avoid - mixed case
type Status = "Pending" | "active" | "COMPLETED";
```

### 2. Define Enums as Types

```typescript
// ✅ Good - reusable type
type OrderStatus = "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED";

export function Query(): { status: OrderStatus } {
    return { status: "PENDING" };
}

// ❌ Avoid - inline literal
export function Query(): { status: "PENDING" | "PROCESSING" } {
    return { status: "PENDING" };
}
```

### 3. Use `as const` for Single Values

```typescript
// ✅ Good - ensures literal type
export function Query() {
    return "RED" as const;
}

// ❌ This returns string type, not enum
export function Query() {
    return "RED";  // Type is string, not "RED"
}
```


## Next Steps

- [Union Types](/guide/unions) — Polymorphic return types
- [Types & Schemas](/guide/types) — Complete type reference
- [Queries](/guide/queries) — Using enums in queries
