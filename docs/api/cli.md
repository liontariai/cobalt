# CLI Commands

Cobalt provides a command-line interface for development and deployment.

## Installation

The CLI is included in the `@cobalt27/dev` package:

```bash
bun add -D @cobalt27/dev
```

Or run commands directly with `bunx`:

```bash
bunx @cobalt27/dev <command>
```

## Commands

### `init`

Initialize a new Cobalt project:

```bash
bunx @cobalt27/dev init
```

This creates:
- Project structure
- Configuration files
- Sample operations
- TypeScript configuration

#### Options

| Option | Description |
|--------|-------------|
| `--template <name>` | Use a specific template |
| `--no-git` | Skip git initialization |

### `dev`

Start the development server:

```bash
bunx cobalt dev
```

Features:
- Hot reload on file changes
- Automatic schema regeneration
- SDK updates in real-time
- GraphQL playground at `/graphql`

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <number>` | Server port | `4000` |
| `-d, --dir <path>` | Operations directory | `server/operations` |
| `--no-playground` | Disable GraphQL playground | - |

#### Example

```bash
bunx cobalt dev --port 3000
```

### `build`

Build for production:

```bash
bunx cobalt build
```

Generates:
- Optimized server bundle
- GraphQL schema
- Compiled resolvers
- Production SDK

#### Options

| Option | Description |
|--------|-------------|
| `--docker` | Optimize for Docker deployment |
| `--out <path>` | Output directory |

### `start`

Start the production server:

```bash
bunx cobalt start
```

Requires running `build` first.

#### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --port <number>` | Server port | `4000` |

## Auth Commands

### `auth init`

Initialize Cobalt Auth:

```bash
bunx cobalt auth init
```

Creates:
- `server/auth.ts` configuration
- Auth database schema
- Example providers

### `auth studio`

Open the auth management studio:

```bash
bunx cobalt auth studio
```

Provides a UI for:
- Managing users
- Viewing sessions
- Configuring providers

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_URL` | Database connection string | - |

## Configuration File

Create `cobalt.config.ts` for advanced configuration:

```typescript
import { defineConfig } from "@cobalt27/dev";

export default defineConfig({
    // Operations directory
    operationsDir: "server/operations",
    
    // Types directory
    typesDir: "server/types",
    
    // Context file
    contextFile: "server/ctx.ts",
    
    // Auth configuration
    authFile: "server/auth.ts",
    
    // Output directory
    outDir: ".cobalt",
    
    // SDK output
    sdkOut: "sdk",
    
    // GraphQL schema output
    schemaOut: "schema.graphql",
    
    // Development options
    dev: {
        port: 4000,
        playground: true,
    },
    
    // Build options
    build: {
        minify: true,
        sourcemap: false,
    },
});
```

## Package Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "dev": "cobalt dev",
    "build": "cobalt build",
    "start": "cobalt start",
    "auth:studio": "cobalt auth studio"
  }
}
```

## Examples

### Development with Custom Port

```bash
bunx cobalt dev --port 3000
```

### Production Build for Docker

```bash
bunx cobalt build --docker
```

### Initialize with Template

```bash
bunx @cobalt27/dev init --template react-router-v7
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :4000

# Kill process
kill -9 <PID>

# Or use different port
bunx cobalt dev --port 4001
```

### Schema Generation Failed

```bash
# Check for TypeScript errors
bunx tsc --noEmit

# Ensure ctx.ts exists
ls server/ctx.ts
```

### SDK Not Updating

```bash
# Restart dev server
# Ctrl+C then:
bunx cobalt dev
```

## Next Steps

- [Getting Started](/guide/getting-started) — First steps with Cobalt
- [Context Helpers](/api/context-helpers) — $$ctx and $$auth
- [SDK Methods](/api/sdk-methods) — Generated SDK reference
