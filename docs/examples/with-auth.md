# With Authentication

This example demonstrates setting up Cobalt Auth with various authentication providers.

## Email Code Provider

The simplest authentication method - users receive a code via email.

### Auth Configuration

```typescript
// server/auth.ts
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
                            // In development, log to console
                            console.log(`Login code for ${email}: ${code}`);
                            
                            // In production, send email
                            // await sendEmail({
                            //     to: email,
                            //     subject: "Your login code",
                            //     body: `Your code is: ${code}`
                            // });
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

                        return ctx.subject("user", { 
                            id: user.id, 
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

## OAuth Providers

### Google OAuth

```typescript
// server/auth.ts
import auth from "@cobalt27/auth";
import { string } from "valibot";
import { GoogleProvider } from "@openauthjs/openauth/provider/google";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";

export default {
    clientId: "my-app",
    issuer: {
        cobalt: auth({
            models: {
                user: {
                    id: "String @id @default(ulid())",
                    googleId: "String? @unique",
                },
            },
            tokens: {
                user: {
                    id: string(),
                    email: string(),
                    name: string(),
                },
            },
            providers: {
                google: GoogleProvider({
                    clientId: process.env.GOOGLE_CLIENT_ID!,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
                    scopes: ["email", "profile"],
                }),
            },
            openauth: (sdk) => ({
                storage: MemoryStorage({
                    persist: "./persist.json",
                }),
                success: async (ctx, value) => {
                    if (value.provider === "google") {
                        const { email, name, sub } = value.claims;

                        const user = await sdk.mutation.adminAuthSignIn({
                            user_id: sub,
                            claims: { email, name },
                            provider: "google",
                        })(({ id }) => ({ id }));

                        return ctx.subject("user", { 
                            id: user!.id, 
                            email,
                            name 
                        });
                    }

                    throw new Error("Invalid provider");
                },
            }),
        }),
    },
};
```

### GitHub OAuth

```typescript
import { GithubProvider } from "@openauthjs/openauth/provider/github";

providers: {
    github: GithubProvider({
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        scopes: ["user:email"],
    }),
}
```

### Multiple Providers

```typescript
providers: {
    code: CodeProvider<{ email: string }>(
        CodeUI({
            mode: "email",
            sendCode: async (email, code) => {
                console.log(`Code for ${email}: ${code}`);
            },
        }),
    ),
    google: GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    github: GithubProvider({
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
},
openauth: (sdk) => ({
    storage: MemoryStorage({ persist: "./persist.json" }),
    success: async (ctx, value) => {
        let email: string;
        let userId: string;
        
        switch (value.provider) {
            case "code":
                email = value.claims.email;
                userId = email;
                break;
            case "google":
                email = value.claims.email;
                userId = value.claims.sub;
                break;
            case "github":
                email = value.claims.email;
                userId = value.claims.id;
                break;
            default:
                throw new Error("Unknown provider");
        }

        const user = await sdk.mutation.adminAuthSignIn({
            user_id: userId,
            claims: { email },
            provider: value.provider,
        })(({ id }) => ({ id }));

        return ctx.subject("user", { id: user!.id, email });
    },
}),
```

## Frontend Integration

### React Router 7 Root

```typescript
// app/root.tsx
import { redirect, Outlet } from "react-router";
import sdk from "sdk";
import {
    makeAuthLoader,
    accessTokenFromCookie,
} from "@cobalt27/auth/react/rr7";

// Initialize SDK with cookie-based auth
sdk.init({
    auth: accessTokenFromCookie,
});

// Create auth-protected loader
export const loader = makeAuthLoader(
    {
        clientID: "my-app",
        issuer: "http://localhost:4000",
        unprotectedPaths: ["/login", "/signup", "/error", "/logout"],
    },
    // On successful auth
    (tokens) => {
        sdk.init({
            auth: tokens.tokens.access,
        });
    },
    // On auth error
    (error) => {
        console.error("Auth error:", error);
        return redirect("/error?error=" + encodeURIComponent(error));
    }
);

export default function Root() {
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </head>
            <body>
                <Outlet />
            </body>
        </html>
    );
}
```

### Error Route

```typescript
// app/routes/error.tsx
import { useSearchParams, Link } from "react-router-dom";

export default function ErrorPage() {
    const [searchParams] = useSearchParams();
    const error = searchParams.get("error");

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
                <h1 className="text-2xl font-bold text-red-600 mb-4">
                    Authentication Error
                </h1>
                <p className="text-gray-600 mb-6">
                    {error || "An unknown error occurred"}
                </p>
                <Link
                    to="/"
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                    Try Again
                </Link>
            </div>
        </div>
    );
}
```

### Logout Route

```typescript
// app/routes/logout.tsx
import { redirect } from "react-router";

export const loader = async () => {
    return redirect("/", {
        headers: {
            "Set-Cookie": [
                "access_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax",
                "refresh_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax",
            ].join(", "),
        },
    });
};

export default function Logout() {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <p>Logging out...</p>
        </div>
    );
}
```

## Using Auth in Operations

### Basic Auth Check

```typescript
// server/operations/profile.ts
export function Query() {
    const { token } = $$auth(this);
    const { id, email } = token.subject.properties;

    return {
        id,
        email,
        displayName: email.split("@")[0],
    };
}

export const __typename = "UserProfile";
```

### Protected Data Access

```typescript
// server/operations/myTodos.ts
export async function Query() {
    const { prisma } = $$ctx(this);
    const { token } = $$auth(this);
    const userId = token.subject.properties.id;

    return prisma.todo.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: "desc" },
    });
}
```

### Role-Based Access

```typescript
// server/operations/adminUsers.ts
export async function Query() {
    const { token } = $$auth(this);
    const { role } = token.subject.properties;

    if (role !== "admin") {
        throw new Error("Admin access required");
    }

    const { prisma } = $$ctx(this);
    return prisma.user.findMany();
}
```

## Storage Options

### Memory Storage (Development)

```typescript
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";

openauth: (sdk) => ({
    storage: MemoryStorage({
        persist: "./auth-data.json", // Persists to file
    }),
    // ...
})
```

### DynamoDB Storage (Production)

```typescript
import { DynamoStorage } from "@openauthjs/openauth/storage/dynamo";

openauth: (sdk) => ({
    storage: DynamoStorage({
        table: "auth-tokens",
    }),
    // ...
})
```

### Redis Storage (Production)

```typescript
import { RedisStorage } from "@openauthjs/openauth/storage/redis";

openauth: (sdk) => ({
    storage: RedisStorage({
        url: process.env.REDIS_URL,
    }),
    // ...
})
```

## Environment Variables

```bash
# .env
# OAuth Providers
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Storage (Production)
REDIS_URL=redis://localhost:6379

# Email Service (Production)
SMTP_HOST=smtp.example.com
SMTP_USER=user
SMTP_PASS=password
```

## Security Best Practices

1. **Use HTTPS in production** - Never send tokens over HTTP
2. **Set secure cookie flags** - HttpOnly, Secure, SameSite
3. **Validate token on every request** - `$$auth` throws if invalid
4. **Use short token expiration** - Balance security vs UX
5. **Implement refresh tokens** - For longer sessions
6. **Log auth events** - For security monitoring

## Next Steps

- [Todo App](/examples/todo-app) — Complete example app
- [Cobalt Auth](/guide/auth) — Full auth documentation
- [Context Factory](/guide/context) — Context setup
