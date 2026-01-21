# Building for Production

This guide covers building and deploying your Cobalt application for production.

## Build Command

Build your application with:

```bash
bunx cobalt build
```

This command bundles the server-side code into a single `cobalt.server.js` file.
It is being saved in the `./dist` directory.

## Start Command

Start the production server:

```bash
bunx cobalt start
```

The server runs on port `4000` by default.

You can use environment variables to change the port or use the `-p` flag.

```bash
PORT=4000 bunx cobalt start
COBALT_PORT=4000 bunx cobalt start # COBALT_PORT takes precedence over PORT
```

or

```bash
bunx cobalt start -p 4000
```

## Build Output

After building, you'll have:

```
dist/
├── cobalt.server.js   # Bundled server
└── cobalt.server.js.map # Source map for the bundled server
```
<!-- 
## Production Checklist

### 1. Environment Configuration

```bash
# Ensure all required env vars are set
DATABASE_URL=...
AUTH_SECRET=...
```

### 2. Database Migrations

Run migrations before starting:

```bash
bunx prisma migrate deploy
```

### 3. Security Headers

Add security headers in your context:

```typescript
// server/ctx.ts
export default async function ({ headers }: CobaltCtxInput) {
    // Validate origin
    const origin = headers.get("Origin");
    
    return {
        headers,
        // ...
    };
}
```

### 4. Rate Limiting

Implement rate limiting for production:

```typescript
import { RateLimiter } from "limiter";

const limiter = new RateLimiter({
    tokensPerInterval: 100,
    interval: "minute"
});

export default async function ({ headers }: CobaltCtxInput) {
    const clientIP = headers.get("X-Forwarded-For");
    
    if (!await limiter.tryRemoveTokens(1)) {
        throw new Error("Rate limit exceeded");
    }
    
    return { headers };
}
```

### 5. Logging

Add production logging:

```typescript
export async function Query(id: string) {
    const startTime = Date.now();
    
    try {
        const result = await fetchData(id);
        
        console.log({
            operation: "getUser",
            duration: Date.now() - startTime,
            success: true
        });
        
        return result;
    } catch (error) {
        console.error({
            operation: "getUser",
            duration: Date.now() - startTime,
            success: false,
            error: error.message
        });
        
        throw error;
    }
}
```

### 6. Error Handling

Handle errors gracefully in production:

```typescript
export async function Query(id: string) {
    try {
        return await fetchUser(id);
    } catch (error) {
        // Log detailed error
        console.error("User fetch failed:", error);
        
        // Return user-friendly message
        throw new Error("Unable to fetch user. Please try again.");
    }
}
```

## Health Checks

The Cobalt server includes a health check endpoint:

```
GET /health
```

Returns `200 OK` when the server is healthy.

## Scaling

### Horizontal Scaling

Cobalt servers are stateless (except for subscriptions). You can run multiple instances behind a load balancer.

```nginx
upstream cobalt {
    server cobalt-1:4000;
    server cobalt-2:4000;
    server cobalt-3:4000;
}

server {
    location /graphql {
        proxy_pass http://cobalt;
    }
}
```

### Subscription Scaling

For subscriptions across multiple instances, use a shared pub/sub system:

```typescript
// server/ctx.ts
import Redis from "ioredis";
import { RedisPubSub } from "graphql-redis-subscriptions";

const redis = new Redis(process.env.REDIS_URL);
const pubsub = new RedisPubSub({
    publisher: redis,
    subscriber: redis.duplicate()
});

export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
        pubsub
    };
}
```

## Monitoring

### Metrics

Track important metrics:

- Request duration
- Error rate
- Active subscriptions
- Database query time

### Example with Prometheus

```typescript
import { Counter, Histogram } from "prom-client";

const requestDuration = new Histogram({
    name: "graphql_request_duration_seconds",
    help: "Duration of GraphQL requests",
    labelNames: ["operation"]
});

const errorCounter = new Counter({
    name: "graphql_errors_total",
    help: "Total GraphQL errors",
    labelNames: ["operation"]
});
```

## Caching

### Response Caching

```typescript
const cache = new Map<string, { data: any; expires: number }>();

export async function Query(id: string) {
    const cacheKey = `user:${id}`;
    const cached = cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
        return cached.data;
    }
    
    const data = await fetchUser(id);
    
    cache.set(cacheKey, {
        data,
        expires: Date.now() + 60000  // 1 minute
    });
    
    return data;
}
```

### Database Query Caching

Use Prisma's query caching or a dedicated cache layer:

```typescript
import { createClient } from "redis";

const redis = createClient({ url: process.env.REDIS_URL });

export async function Query(id: string) {
    const cached = await redis.get(`user:${id}`);
    
    if (cached) {
        return JSON.parse(cached);
    }
    
    const user = await prisma.user.findUnique({ where: { id } });
    
    await redis.setEx(`user:${id}`, 300, JSON.stringify(user));
    
    return user;
}
```

## Deployment Platforms

### Fly.io

```toml
# fly.toml
app = "my-cobalt-app"

[build]
  builder = "heroku/buildpacks:20"

[env]
  PORT = "4000"

[[services]]
  internal_port = 4000
  protocol = "tcp"

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

### Railway

```json
// railway.json
{
  "build": {
    "builder": "nixpacks"
  },
  "deploy": {
    "startCommand": "bunx cobalt start"
  }
}
```

### Vercel (Edge Functions)

Cobalt can be adapted for edge deployment. See the Docker guide for containerized deployments. -->

### Deployment

The build output is currently optimized for [Bun](https://bun.sh).

Therefore you'll need to use an environment with the Bun runtime installed.

Having bun installed, you can easily start the server with:

```bash
bunx cobalt start
```

or

```bash
bunx cobalt start -p 4000
```

#### Why use `cobalt start` instead of `bun run cobalt.server.js`?

`cobalt start` is a wrapper around `bun run cobalt.server.js` that adds some additional features:

- It looks for `cobalt.server.js` in the `dist` directory or the current directory.
- It initializes Cobalt Auth if it is used in the project.



## Next Steps

- [Docker](/guide/docker) — Containerized deployment
- [Cobalt Auth](/guide/auth) — Production auth setup
- [Context Factory](/guide/context) — Production context configuration
