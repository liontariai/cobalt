# Docker Deployment

Cobalt provides built-in Docker support for containerized deployments.

## Building for Docker

Create a Docker-optimized build:

```bash
bunx cobalt build --docker
```

This generates an optimized bundle suitable for containerization.

## Build Output

After building, you'll have:

```
dist/
├── .dockerignore           # Docker ignore file
├── cobalt.server.js        # Production server entry point
├── cobalt.server.js.map    # Source map for the bundled server
├── Dockerfile              # Dockerfile for the containerized server
└── package.json            # Production dependencies
```

## Dockerfile

A basic Dockerfile for Cobalt will look like this:

```dockerfile
FROM oven/bun:latest AS builder
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app
COPY . .
RUN bun install

FROM oven/bun:latest
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/cobalt.server.js ./cobalt.server.js

EXPOSE 4000
CMD ["bunx", "cobalt", "start"]

```

## Prisma-Aware Cobalt Build

To make your life easier, the `cobalt build --docker` command is aware of Prisma and will automatically copy the Prisma schema and configuration files to the container.

The resulting `dist` directory will look like this:
```
dist/
├── prisma/                 # Prisma schema and configuration files
│   └── schema.prisma       # Prisma schema
├── .dockerignore           # Docker ignore file
├── .env                    # Environment variables
├── cobalt.server.js        # Production server entry point
├── cobalt.server.js.map    # Source map for the bundled server
├── Dockerfile              # Dockerfile for the containerized server
├── package.json            # Production dependencies
└── prisma.config.ts        # Prisma configuration
```

<!-- ## Best Practices

### 1. Use Multi-Stage Builds

Keep images small by separating build and runtime stages.

### 2. Don't Run as Root

```dockerfile
USER bun
CMD ["bun", "run", "server.js"]
```

### 3. Use .dockerignore

```
# .dockerignore
node_modules
.git
.env*
*.log
.cobalt
```

### 4. Pin Base Image Versions

```dockerfile
# ✅ Good - pinned version
FROM oven/bun:1.0.25

# ❌ Avoid - floating tag
FROM oven/bun:latest
```

### 5. Handle Graceful Shutdown

```typescript
// Handle SIGTERM
process.on("SIGTERM", async () => {
    console.log("Shutting down gracefully...");
    // Close database connections
    await prisma.$disconnect();
    process.exit(0);
});
``` -->

## Next Steps

- [Building for Production](/guide/production) — Production best practices
- [Cobalt Auth](/guide/auth) — Auth in Docker
- [Context Factory](/guide/context) — Container configuration
