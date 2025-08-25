import fs from "fs";
import path from "path";
import { execSync, spawn } from "child_process";
import { createHash } from "crypto";
import { globSync } from "glob";
import type { PrismaFields } from "../types";
import { findNodeModulesDir } from "./helpers";

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

    const serverDir = path.join(cobaltAuthDir, "server");
    const dbDir = path.join(serverDir, "db");
    const zschemaDir = path.join(dbDir, "schema");
    const prismaClient = path.join(zschemaDir, "@prisma", "client");
    const prismaSchema = path.join(zschemaDir, "prisma", "schema.prisma");
    const zschemaPath = path.join(zschemaDir, "_schema.zmodel");

    const pgliteDataDir =
        process.env.COBALT_AUTH_DATABASE_URL || path.join(dbDir, "pglite_data");
    process.env.COBALT_AUTH_DATABASE_URL = pgliteDataDir; //`file:${path.join(dbDir, "dev")}`;

    const fileHashes: Set<string> = new Set();
    // copy over template project

    const schemaDir = path.resolve(
        import.meta.dir,
        "..",
        "server",
        "db",
        "schema",
    );

    const schemaFiles = globSync(`${schemaDir}/**/*.zmodel`);
    for (const p of schemaFiles) {
        const fname = path.basename(p);
        const fileContent = fs.readFileSync(p, "utf-8");

        const relPathFromSchemaDir = p.split(schemaDir)[1];

        const hash = createHash("sha256")
            .update(`${p}:${fileContent}`)
            .digest("hex");
        if (fileHashes.has(hash)) {
            continue;
        }
        fileHashes.add(hash);

        if (fname === "_schema.zmodel") {
            const modifiedContent = fileContent
                .replaceAll("DATABASE_URL", "COBALT_AUTH_DATABASE_URL")
                .replaceAll(
                    "PRISMA_CLIENT_OUTPUT",
                    "COBALT_AUTH_PRISMA_CLIENT_OUTPUT",
                );

            const _dir = path.join(zschemaDir, fname);
            fs.mkdirSync(path.dirname(_dir), { recursive: true });
            fs.writeFileSync(_dir, modifiedContent);
        } else {
            const _dir = path.join(zschemaDir, relPathFromSchemaDir);
            fs.mkdirSync(path.dirname(_dir), { recursive: true });
            fs.writeFileSync(_dir, fileContent);
        }
    }

    const serverOpsDir = path.join(serverDir, "operations");
    const copySourceServerDir = path.resolve(import.meta.dir, "..", "server");

    const serverFiles = globSync(`${copySourceServerDir}/**/*.ts`);
    for (const p of serverFiles) {
        if (p.startsWith(path.join(copySourceServerDir, "db"))) {
            continue;
        }

        const fileContent = fs.readFileSync(p, "utf-8");

        const hash = createHash("sha256")
            .update(`${p}:${fileContent}`)
            .digest("hex");
        if (fileHashes.has(hash)) {
            continue;
        }
        fileHashes.add(hash);

        const targetPath = path.join(
            serverDir,
            path.relative(copySourceServerDir, p),
        );
        // Ensure target directory exists
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, fileContent);
    }

    fs.writeFileSync(
        path.join(cobaltAuthDir, ".env.public"),
        `
        COBALT_AUTH_PRISMA_CLIENT_OUTPUT="${path.relative(cobaltAuthDir, prismaClient)}"
        COBALT_AUTH_DATABASE_URL="${path.relative(cobaltAuthDir, pgliteDataDir)}"
        `,
    );

    fs.writeFileSync(
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

    fs.writeFileSync(
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
        ? new Set(
              JSON.parse(
                  fs.readFileSync(cachedHashesFile, "utf-8"),
              ) as string[],
          )
        : new Set();
    if (cachedHashes.union(fileHashes).size !== cachedHashes.size) {
        fs.writeFileSync(
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

    // Ensure zenstack directory exists
    fs.mkdirSync(zenstackDir, { recursive: true });

    execSync(
        `bun --bun zenstack generate --schema ${zschemaPath} --output ${zenstackDir}`,
        {
            env: {
                ...process.env,
                COBALT_AUTH_PRISMA_CLIENT_OUTPUT: prismaClient,
            },
            stdio: "ignore",
        },
    );

    execSync(`bun --bun prisma generate --schema ${prismaSchema}`, {
        env: {
            ...process.env,
            COBALT_AUTH_PRISMA_CLIENT_OUTPUT: prismaClient,
            COBALT_AUTH_DATABASE_URL: "memory://", //`file:${path.join(dbDir, "dev")}`,
        },
        cwd: cobaltAuthDir,
        stdio: "ignore",
    });

    // replace provider sqlite with postgresql
    const prismaSchemaContent = fs.readFileSync(prismaSchema, "utf-8");
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
    fs.writeFileSync(prismaSchema, prismaSchemaContentWithPostgresqlUrl);

    let outputBuffer = "";
    let done = false;
    await new Promise<void>((resolve, reject) => {
        const child = spawn(
            "bun",
            ["--bun", "prisma", "db", "push", "--schema", prismaSchema],
            {
                env: {
                    ...process.env,
                    COBALT_AUTH_PRISMA_CLIENT_OUTPUT: prismaClient,
                    COBALT_AUTH_DATABASE_URL: pgliteDataDir,
                },
                cwd: cobaltAuthDir,
                stdio: ["ignore", "pipe", "pipe"],
            },
        );

        child.stdout.on("data", (data) => {
            const str = data.toString();
            outputBuffer += str;
            if (outputBuffer.includes("Done in")) {
                done = true;
                resolve();
            }
        });

        child.stderr.on("data", (data) => {
            const str = data.toString();
            outputBuffer += str;
        });

        child.on("close", (code) => {
            if (code !== 0) {
                reject(
                    new Error(
                        `prisma db push exited with code ${code}\n${outputBuffer}`,
                    ),
                );
            } else {
                if (!done) {
                    resolve();
                }
            }
        });
        child.on("error", reject);
    });

    return serverOpsDir;
};
