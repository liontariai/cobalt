import fs from "fs";
import path from "path";
import type { PrismaFields } from "../types";
import { findNodeModulesDir } from "./helpers";

import { $ } from "bun";

export const makeIdentityManagementPlatform = async ({
    models,
}: {
    models: Record<
        string,
        {
            id: "String @id @default(ulid())";
        } & {
            [key: string]: PrismaFields;
        }
    >;
}) => {
    const cobaltAuthDir = path.join(findNodeModulesDir(), ".cobalt", "auth");

    // await $`rm -rf ${cobaltAuthDir}`.quiet();

    const serverDir = path.join(cobaltAuthDir, "server");
    const dbDir = path.join(serverDir, "db");
    const zschemaDir = path.join(dbDir, "schema");
    const prismaClient = path.join(zschemaDir, "@prisma", "client");
    const prismaSchema = path.join(zschemaDir, "prisma", "schema.prisma");
    const zschemaPath = path.join(zschemaDir, "_schema.zmodel");

    const pgliteDataDir =
        process.env.COBALT_AUTH_DATABASE_URL || path.join(dbDir, "pglite_data");
    process.env.COBALT_AUTH_DATABASE_URL = pgliteDataDir; //`file:${path.join(dbDir, "dev")}`;

    const hasher = new Bun.CryptoHasher("sha256");
    const fileHashes: Set<string> = new Set();
    // copy over template project

    const schemaDir = path.resolve(
        import.meta.dir,
        "..",
        "server",
        "db",
        "schema",
    );
    for (const p of new Bun.Glob(`${schemaDir}/**/*.zmodel`).scanSync()) {
        const fname = p.split(path.sep).pop()!;
        const f = Bun.file(p);

        const relPathFromSchemaDir = p.split(schemaDir)[1];

        const hash = hasher.update(`${p}:${await f.text()}`).digest("hex");
        if (fileHashes.has(hash)) {
            continue;
        }
        fileHashes.add(hash);

        if (fname === "_schema.zmodel") {
            await Bun.write(
                path.join(zschemaDir, fname),
                (await f.text())
                    .replaceAll("DATABASE_URL", "COBALT_AUTH_DATABASE_URL")
                    .replaceAll(
                        "PRISMA_CLIENT_OUTPUT",
                        "COBALT_AUTH_PRISMA_CLIENT_OUTPUT",
                    ),
            );
        } else {
            await Bun.write(path.join(zschemaDir, relPathFromSchemaDir), f);
        }
    }

    const serverOpsDir = path.join(serverDir, "operations");
    const copySourceServerDir = path.resolve(import.meta.dir, "..", "server");

    for (const p of new Bun.Glob(`${copySourceServerDir}/**/*.ts`).scanSync()) {
        if (p.startsWith(path.join(copySourceServerDir, "db"))) {
            continue;
        }

        const f = Bun.file(p);

        const hash = hasher.update(`${p}:${await f.text()}`).digest("hex");
        if (fileHashes.has(hash)) {
            continue;
        }
        fileHashes.add(hash);

        await Bun.write(
            path.join(serverDir, path.relative(copySourceServerDir, p)),
            f,
        );
    }

    await Bun.write(
        path.join(cobaltAuthDir, ".env.public"),
        `
        COBALT_AUTH_PRISMA_CLIENT_OUTPUT="${path.relative(cobaltAuthDir, prismaClient)}"
        COBALT_AUTH_DATABASE_URL="${path.relative(cobaltAuthDir, pgliteDataDir)}"
        `,
    );

    await Bun.write(
        path.join(cobaltAuthDir, "prisma.config.ts"),
        `
        import path from "node:path";
        import type { PrismaConfig } from "prisma";
        import { PGlite } from "@electric-sql/pglite";
        import { PrismaPGlite } from "pglite-prisma-adapter";
        import dotenv from "dotenv";
        dotenv.config({ path: ".env.public" });

        export default {
            experimental: {
                adapter: true,
                studio: true,
            },
            schema: process.env.COBALT_AUTH_PRISMA_SCHEMA_PATH || path.join("server", "db", "schema", "prisma", "schema.prisma"),
            adapter: async () => {
                const client = new PGlite({ dataDir: process.env.COBALT_AUTH_DATABASE_URL });
                return new PrismaPGlite(client);
            },
            studio: {
                adapter: async () => {
                    const client = new PGlite({ dataDir: process.env.COBALT_AUTH_DATABASE_URL });
                    return new PrismaPGlite(client);
                },
            },
        } satisfies PrismaConfig;
        `,
    );

    await Bun.write(
        path.join(cobaltAuthDir, "tsconfig.json"),
        `
        {
            "include": ["./**/*.ts"],
            "compilerOptions": {
                // Enable latest features
                "lib": ["ESNext", "DOM"],
                "target": "ESNext",
                "module": "ESNext",
                "moduleDetection": "force",
                "jsx": "react-jsx",
                "allowJs": true,

                "types": ["@cobalt27/runtime", "@cobalt27/auth", "node"],

                // Bundler mode
                "moduleResolution": "bundler",
                "allowImportingTsExtensions": true,
                "verbatimModuleSyntax": true,
                "noEmit": true,

                // Best practices
                "skipLibCheck": true,
                "noFallthroughCasesInSwitch": true,

                // Some stricter flags (disabled by default)
                "noUnusedLocals": false,
                "noUnusedParameters": false,
                "noPropertyAccessFromIndexSignature": false,

                // needed for correctly detecting null | undefined in types
                "strict": true,
                // we are using 'this' for cobalt runtime helper functions and dont want to define it, so let's mute the ts error
                "noImplicitThis": false,

                "baseUrl": ".",
                "paths": {
                    "@/*": ["server/*"],
                    "$$ctx": ["server/ctx.ts"],
                    "$$types": ["server/$$types/index.ts"]
                }
            }
        }`,
    );

    const cachedHashesFile = path.join(cobaltAuthDir, "cached-hashes.json");
    const cachedHashes = fs.existsSync(cachedHashesFile)
        ? new Set((await Bun.file(cachedHashesFile).json()) as string[])
        : new Set();
    if (cachedHashes.union(fileHashes).size !== cachedHashes.size) {
        await Bun.write(
            cachedHashesFile,
            JSON.stringify(Array.from(fileHashes)),
        );
    } else {
        console.log(
            "No changes detected for cobalt auth, skipping zenstack & prisma generate",
        );
        return serverOpsDir;
    }

    const zenstackDir = path.join(serverDir, "db", "zenstack");

    await $`bun --bun zenstack generate --schema ${zschemaPath} --output ${zenstackDir}`
        .env({
            ...process.env,
            COBALT_AUTH_PRISMA_CLIENT_OUTPUT: prismaClient,
        })
        .quiet();
    await $`bun --bun prisma generate --schema ${prismaSchema}`
        .env({
            ...process.env,
            COBALT_AUTH_PRISMA_CLIENT_OUTPUT: prismaClient,
            COBALT_AUTH_DATABASE_URL: "memory://", //`file:${path.join(dbDir, "dev")}`,
        })
        .cwd(cobaltAuthDir)
        .quiet();

    // replace provider sqlite with postgresql
    const prismaSchemaContent = await Bun.file(prismaSchema).text();
    const prismaSchemaContentWithPostgresql = prismaSchemaContent.replace(
        'provider = "sqlite"',
        'provider = "postgresql"',
    );
    // set url to postgresql://
    const prismaSchemaContentWithPostgresqlUrl =
        prismaSchemaContentWithPostgresql.replace(
            'url      = env("COBALT_AUTH_DATABASE_URL")',
            'url      = "postgresql://"',
        );
    await Bun.write(prismaSchema, prismaSchemaContentWithPostgresqlUrl);

    await $`bun --bun prisma db push --schema ${prismaSchema}`
        .env({
            ...process.env,
            COBALT_AUTH_PRISMA_CLIENT_OUTPUT: prismaClient,
            COBALT_AUTH_DATABASE_URL: pgliteDataDir,
        })
        .cwd(cobaltAuthDir)
        .quiet();

    return serverOpsDir;
};
