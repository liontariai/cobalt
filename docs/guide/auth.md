# Cobalt Auth

Cobalt Auth provides built-in authentication using [OpenAuthJS](https://github.com/sst/openauth). It supports multiple authentication providers including email/password, OAuth, and passwordless flows.

## Overview

Cobalt Auth:
- Integrates seamlessly with Cobalt operations
- Provides the `$$auth` helper for accessing tokens
- Supports multiple authentication providers
- Handles token management automatically

## Setup

### 1. Create the Auth Configuration

Create `server/auth.ts`:

```typescript
import auth from "@cobalt27/auth";
import { string } from "valibot";
import { CodeUI } from "@openauthjs/openauth/ui/code";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";
import { CodeProvider } from "@openauthjs/openauth/provider/code";

export default {
    clientId: "my-app",
    issuer: {
        cobalt: auth({
            models: {
                user: {
                    id: "String @id @default(ulid())",
                },
            },
            tokens: {
                user: {
                    id: string(),
                    email: string(),
                },
            },
            providers: {
                code: CodeProvider<{ email: string }>(
                    CodeUI({
                        mode: "email",
                        sendCode: async (email, code) => {
                            console.log(`Send code ${code} to ${email}`);
                            // Send email with code
                        },
                    }),
                ),
            },
            openauth: (sdk) => ({
                storage: MemoryStorage({
                    persist: "./persist.json",
                }),
                success: async (ctx, value) => {
                    if (value.provider === "code") {
                        const email = value.claims.email;

                        const user = await sdk.mutation.adminAuthSignIn({
                            user_id: email,
                            claims: { email },
                            provider: "email",
                        })(({ id }) => ({ id }));

                        if (!user?.id) {
                            throw new Error("User not found");
                        }

                        return ctx.subject("user", { id: user.id, email });
                    }

                    throw new Error("Invalid provider");
                },
            }),
        }),
    },
};
```

## Configuration Options

### Models

Define your user and identity models:

```typescript
models: {
    user: {
        id: "String @id @default(ulid())",
        // Additional fields
        name: "String?",
        createdAt: "DateTime @default(now())",
    },
}
```

### Tokens

Define the shape of your JWT tokens:

```typescript
tokens: {
    user: {
        id: string(),
        email: string(),
        role: optional(string()),
    },
}
```

### Providers

Configure authentication providers:

#### Email Code Provider

```typescript
providers: {
    code: CodeProvider<{ email: string }>(
        CodeUI({
            mode: "email",
            sendCode: async (email, code) => {
                await sendEmail({
                    to: email,
                    subject: "Your login code",
                    body: `Your code is: ${code}`
                });
            },
        }),
    ),
}
```

#### OAuth Providers

```typescript
import { GoogleProvider } from "@openauthjs/openauth/provider/google";
import { GithubProvider } from "@openauthjs/openauth/provider/github";

providers: {
    google: GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    github: GithubProvider({
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
}
```

### Storage

Configure how tokens are stored:

```typescript
// Memory storage (for development)
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";

openauth: (sdk) => ({
    storage: MemoryStorage({
        persist: "./auth-data.json",
    }),
    // ...
})

// DynamoDB storage (for production)
import { DynamoStorage } from "@openauthjs/openauth/storage/dynamo";

openauth: (sdk) => ({
    storage: DynamoStorage({
        table: "auth-tokens",
    }),
    // ...
})
```

## Using Auth in Operations

### The `$$auth` Helper

Access the authenticated user's token:

```typescript
export function Query() {
    const { token } = $$auth(this);
    
    // Access token properties
    const { id, email } = token.subject.properties;
    
    return {
        userId: id,
        userEmail: email
    };
}
```

### Full `$$auth` Response

```typescript
export function Query() {
    const auth = $$auth(this);
    
    // auth.token - The JWT token
    // auth.query - Cobalt Auth SDK query methods
    // auth.mutation - Cobalt Auth SDK mutation methods
    
    return { ... };
}
```

### Protected Mutations

```typescript
export async function Mutation(data: CreatePostInput) {
    const { prisma } = $$ctx(this);
    const { token } = $$auth(this);
    
    const userId = token.subject.properties.id;
    
    return prisma.post.create({
        data: {
            ...data,
            authorId: userId
        }
    });
}
```

### Admin Operations

Access admin SDK methods:

```typescript
export async function Mutation(userId: string, role: string) {
    const { mutation } = $$auth(this);
    
    // Use admin SDK to update user
    await mutation.adminUpdateUser({
        id: userId,
        data: { role }
    });
    
    return { success: true };
}
```

## Frontend Integration

### React Router 7 Setup

```typescript
// root.tsx
import { redirect } from "react-router";
import sdk from "sdk";
import {
    makeAuthLoader,
    accessTokenFromCookie,
} from "@cobalt27/auth/react/rr7";

// Initialize SDK with cookie-based auth
sdk.init({
    auth: accessTokenFromCookie,
});

// Create auth loader
export const loader = makeAuthLoader(
    {
        clientID: "my-app",
        issuer: "http://localhost:4000",
        unprotectedPaths: ["/login", "/error", "/logout"],
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

### Auth Loader Options

```typescript
makeAuthLoader({
    clientID: "my-app",           // Your client ID
    issuer: "http://localhost:4000",  // Cobalt Auth URL
    unprotectedPaths: [           // Public routes
        "/login",
        "/signup", 
        "/error"
    ],
}, onSuccess, onError)
```

### Logout Route

```typescript
// routes/logout.tsx
import { redirect } from "react-router";

export const loader = async () => {
    // Clear auth cookies
    return redirect("/login", {
        headers: {
            "Set-Cookie": "access_token=; Path=/; HttpOnly; Max-Age=0"
        }
    });
};
```

## Complete Auth Flow Example

### 1. Auth Configuration

```typescript
// server/auth.ts
import auth from "@cobalt27/auth";
import { string } from "valibot";
import { CodeUI } from "@openauthjs/openauth/ui/code";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";
import { CodeProvider } from "@openauthjs/openauth/provider/code";

export default {
    clientId: "todo-app",
    issuer: {
        cobalt: auth({
            models: {
                user: {
                    id: "String @id @default(ulid())",
                },
            },
            tokens: {
                user: {
                    id: string(),
                    email: string(),
                },
            },
            providers: {
                code: CodeProvider<{ email: string }>(
                    CodeUI({
                        mode: "email",
                        sendCode: async (email, code) => {
                            console.log(`Login code for ${email}: ${code}`);
                        },
                    }),
                ),
            },
            openauth: (sdk) => ({
                storage: MemoryStorage({
                    persist: "./persist.json",
                }),
                success: async (ctx, value) => {
                    if (value.provider === "code") {
                        const email = value.claims.email;

                        const user = await sdk.mutation.adminAuthSignIn({
                            user_id: email,
                            claims: { email },
                            provider: "email",
                        })(({ id }) => ({ id }));

                        return ctx.subject("user", { 
                            id: user!.id, 
                            email 
                        });
                    }
                    throw new Error("Invalid provider");
                },
            }),
        }),
    },
};
```

### 2. Protected Operation

```typescript
// server/operations/profile.ts
export function Query() {
    const { token } = $$auth(this);
    const { id, email } = token.subject.properties;
    
    return {
        id,
        email,
        displayName: email.split("@")[0]
    };
}

export const __typename = "UserProfile";
```

### 3. Frontend Usage

```typescript
// Get user profile
const profile = await sdk.query.profile();
console.log(profile.email);
```

## Security Best Practices

1. **Always validate tokens** - The `$$auth` helper throws if no valid token exists
2. **Use HTTPS in production** - Never send tokens over unencrypted connections
3. **Set appropriate token expiration** - Balance security and user experience
4. **Implement proper logout** - Clear all stored tokens
5. **Protect sensitive operations** - Use `$$auth` in all protected routes

## Next Steps

- [Frontend Integration](/guide/frontend-integration) — Complete frontend setup
- [Context Factory](/guide/context) — Understand the context system
- [Examples](/examples/with-auth) — See auth in action
