/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import { Command } from "commander";
import {
    createDirectory,
    writeFile,
    initializeAndCompile,
    removeFile,
    resolve,
} from "./shared";
import path from "path";
import fs from "fs";

import JSONC from "comment-json";

// @ts-ignore
import server_code_as_string from "../server.ts" with { type: "text" };
// @ts-ignore
import server_util_code_as_string from "../util.ts" with { type: "text" };

type CobaltAuthConfig = import("@cobalt27/auth").CobaltAuthConfig;

export const buildCommand = (program: Command) => {
    const buildCmd = program
        .command("build")
        .description("Build the application for production")
        .option("--dir <dir>", "Directory to search for operation endpoints")
        .option("--out <path>", "Output directory for build artifacts", "dist")
        .option("--pretty", "Format the output graphql/openapi schema", false)
        .option(
            "--docker",
            "Create a bundle and prepare a directory with a Dockerfile",
            false,
        )
        .option(
            "--docker-debug-with-local-npm-registry",
            "Use a local npm registry for debugging",
            false,
        )
        .action(async (options) => {
            const t1 = performance.now();

            const outDir = path.resolve(options.out || "dist");
            createDirectory(outDir);

            console.log(`🚀 Building Cobalt application...`);
            process.env.OPENAUTH_ISSUER ??= "placeholder";

            const {
                operationsDir,
                ctxFile,
                authFile,
                schema,
                writeSchemaOut,
                writeTypesOut,
                writeSdkOut,
            } = await initializeAndCompile(options, async (authConfigFile) => {
                // build and bootstrap cobalt-auth
                process.env.COBALT_AUTH_DEV = "true";
                process.env.COBALT_AUTH_CONFIG_FILEPATH = authConfigFile;

                if (require.cache[authConfigFile]) {
                    delete require.cache[authConfigFile];
                }
                const authConfig = (
                    require(authConfigFile) as {
                        default: CobaltAuthConfig;
                    }
                ).default;
                const {
                    issuer: { cobalt },
                } = authConfig;
                // bootstrap cobalt-auth
                await Promise.resolve(cobalt);

                delete process.env.COBALT_AUTH_DEV;
                delete process.env.COBALT_AUTH_CONFIG_FILEPATH;
            });

            await Promise.all([
                writeSchemaOut(),
                writeTypesOut(),
                writeSdkOut(),
            ]);

            console.log(`📁 Operations directory: ${operationsDir}`);
            console.log(
                `📁 Output directory: ${path.relative(process.cwd(), outDir)}`,
            );

            let serverCodePatched: string = server_code_as_string
                .replace(
                    "let _ctxFile: any;",
                    `import ctxFile from process.env.COBALT_CTX_PATH; let _ctxFile = ctxFile;`,
                )
                .replace(
                    `let _resolversFile: any;`,
                    `import * as resolversFile from process.env.COBALT_RESOLVERS_PATH; let _resolversFile = resolversFile;`,
                )

                .replaceAll(
                    "let _schema: string | undefined;",
                    `import schema from "./schema.graphql" with { type: "text" }; let _schema = schema;`,
                )
                .replaceAll(
                    "process.env.COBALT_CTX_PATH",
                    `"${path.relative(outDir, ctxFile)}"`,
                )
                .replaceAll(
                    "process.env.COBALT_RESOLVERS_PATH",
                    `"${path.relative(outDir, ".cobalt/resolvers.ts")}"`,
                )
                .replaceAll(
                    "process.env.PORT",
                    `process.env.PORT || ${String(options.port || 4000)}`,
                );

            const projectPackageJson = require(
                path.join(process.cwd(), "package.json"),
            ) as {
                dependencies: Record<string, string>;
                name: string;
                scripts: Record<string, string>;
                devDependencies: Record<string, string>;
            };
            const usesCobaltAuth = !!(
                authFile &&
                Object.keys(projectPackageJson.dependencies).find(
                    (dep) => dep === "@cobalt27/auth",
                ) !== undefined
            );

            const tsconfig = JSONC.parse(
                fs.readFileSync(
                    path.join(process.cwd(), "tsconfig.json"),
                    "utf8",
                ),
            ) as any;

            if (usesCobaltAuth) {
                serverCodePatched = serverCodePatched
                    .replace(
                        `let _cobaltAuth: any;`,
                        `
                        process.env.buildtime = "true";
                        process.env.authconfigfilepath = process.env.COBALT_AUTH_CONFIG_FILEPATH!;
                        import cobaltAuth from process.env.COBALT_AUTH_CONFIG_FILEPATH!;
                        let _cobaltAuth = cobaltAuth;
                        `,
                    )
                    .replaceAll(
                        "process.env.COBALT_AUTH_CONFIG_FILEPATH!",
                        `"${path.relative(outDir, authFile)}"`,
                    );

                writeFile(
                    path.join(outDir, "cobalt-auth-sdk.ts"),
                    fs
                        .readFileSync(
                            Bun.resolveSync(".cobalt/auth/sdk", process.cwd()),
                        )
                        .toString(),
                );

                writeFile(
                    path.join(outDir, "cobalt-auth-compiled.ts"),
                    `
                    import * as types from "${Bun.resolveSync(".cobalt/auth/server/$$types/index", process.cwd())}";
                    import * as resolvers from "${Bun.resolveSync(".cobalt/auth/resolvers", process.cwd())}";
                    import ctx from "${Bun.resolveSync(".cobalt/auth/server/ctx", process.cwd())}";
                    import schema from "${Bun.resolveSync(".cobalt/auth/schema.graphql", process.cwd())}" with { type: "text" };
                    export { types, resolvers, schema, ctx };
                    `,
                );

                tsconfig.compilerOptions.paths = {
                    ...tsconfig.compilerOptions.paths,
                    ".cobalt/auth/sdk": ["./cobalt-auth-sdk.ts"],
                    ".cobalt/auth/compiled": ["./cobalt-auth-compiled.ts"],
                };
            } else {
                serverCodePatched = serverCodePatched
                    .replace(
                        `let _cobaltAuth: any;`,
                        `let _cobaltAuth = undefined;`,
                    )
                    .replace(
                        `require(process.env.COBALT_AUTH_CONFIG_FILEPATH!);`,
                        `undefined;`,
                    );
            }

            const cobaltAuthManifest = usesCobaltAuth
                ? `{
                version: "${
                    require(
                        Bun.resolveSync(
                            "@cobalt27/auth/package.json",
                            process.cwd(),
                        ),
                    ).version
                }",
            }`
                : "undefined";
            serverCodePatched = serverCodePatched.concat(`
                const buildManifest = {
                    cobalt: {
                        version: "${
                            require(
                                Bun.resolveSync(
                                    "@cobalt27/dev/package.json",
                                    process.cwd(),
                                ),
                            ).version
                        }",
                        build: {
                            operationsDir: "${operationsDir}",
                        },
                        cobaltAuth: ${cobaltAuthManifest},
                    },
                };
                if(process.env.COBALT_DEV_RETURN_MANIFEST) {
                    console.log("=== BUILD MANIFEST ===");
                    console.log(JSON.stringify(buildManifest, null, 2));
                    console.log("=== END BUILD MANIFEST ===");
                } else if(process.env.COBALT_AUTH_EXECUTE_INIT) {
                    console.log("🚀 Executing cobalt auth init via bundled server...");
                    if(!process.env.COBALT_AUTH_DATABASE_URL) {
                        console.log("🚨 COBALT_AUTH_DATABASE_URL is not set");
                        process.exit(1);
                    }

                    const { zenstackPrismaSchema, prismaConfigTs } = require(".cobalt/auth/compiled") as {
                        zenstackPrismaSchema: string;
                        prismaConfigTs: string;
                    };
                    const fs = require("fs");
                    const path = require("path");

                    fs.mkdirSync(path.join(process.cwd(), ".cobalt/auth"), { recursive: true });
                    fs.writeFileSync(
                        path.join(process.cwd(), ".cobalt/auth/schema.prisma"),
                        zenstackPrismaSchema,
                    );
                    fs.writeFileSync(
                        path.join(process.cwd(), ".cobalt/auth/prisma.config.ts"),
                        prismaConfigTs,
                    );

                    fs.mkdirSync(process.env.COBALT_AUTH_DATABASE_URL!, { recursive: true });
                    await Bun.$\`bun --bun /app/node_modules/.bin/prisma db push --skip-generate\`.cwd(path.join(process.cwd(), ".cobalt/auth")).env({
                        ...process.env,
                        COBALT_AUTH_PRISMA_SCHEMA_PATH: path.join(process.cwd(), ".cobalt/auth/schema.prisma"),
                    });

                    fs.unlinkSync(path.join(process.cwd(), ".cobalt/auth/schema.prisma"));
                    fs.unlinkSync(path.join(process.cwd(), ".cobalt/auth/prisma.config.ts"));
                    fs.rmdirSync(path.join(process.cwd(), ".cobalt/auth"));
                    fs.rmdirSync(path.join(process.cwd(), ".cobalt"));

                    console.log("🚀 Cobalt auth init completed");
                } else if(process.env.COBALT_AUTH_EXECUTE_STUDIO) {
                    console.log("🚀 Executing cobalt auth studio via bundled server...");
                    if(!process.env.COBALT_AUTH_DATABASE_URL) {
                        console.log("🚨 COBALT_AUTH_DATABASE_URL is not set");
                        process.exit(1);
                    }

                    const { zenstackPrismaSchema, prismaConfigTs } = require(".cobalt/auth/compiled") as {
                        zenstackPrismaSchema: string;
                        prismaConfigTs: string;
                    };
                    const fs = require("fs");
                    const path = require("path");

                    fs.mkdirSync(path.join(process.cwd(), ".cobalt/auth"), { recursive: true });
                    fs.writeFileSync(
                        path.join(process.cwd(), ".cobalt/auth/schema.prisma"),
                        zenstackPrismaSchema,
                    );
                    fs.writeFileSync(
                        path.join(process.cwd(), ".cobalt/auth/prisma.config.ts"),
                        prismaConfigTs,
                    );

                    fs.mkdirSync(process.env.COBALT_AUTH_DATABASE_URL!, { recursive: true });
                    await Bun.$\`bun --bun /app/node_modules/.bin/prisma studio\`.cwd(path.join(process.cwd(), ".cobalt/auth")).env({
                        ...process.env,
                        COBALT_AUTH_PRISMA_SCHEMA_PATH: path.join(process.cwd(), ".cobalt/auth/schema.prisma"),
                    });

                    fs.unlinkSync(path.join(process.cwd(), ".cobalt/auth/schema.prisma"));
                    fs.unlinkSync(path.join(process.cwd(), ".cobalt/auth/prisma.config.ts"));
                    fs.rmdirSync(path.join(process.cwd(), ".cobalt/auth"));
                    fs.rmdirSync(path.join(process.cwd(), ".cobalt"));

                    console.log("🚀 Cobalt auth studio completed");
                } else {
                    const httpServer = startServer();
                    console.log("🚀 Server started on port", httpServer.port);
                }
            `);

            writeFile(path.join(outDir, "schema.graphql"), schema);
            writeFile(path.join(outDir, "cobalt.server.ts"), serverCodePatched);
            writeFile(path.join(outDir, "util.ts"), server_util_code_as_string);

            await Bun.build({
                entrypoints: [path.join(outDir, "cobalt.server.ts")],
                outdir: outDir,
                banner: "var self = globalThis;",
                external: Object.keys(projectPackageJson.dependencies)
                    .filter(
                        (dep) =>
                            ![
                                // embed these dependencies
                                "@cobalt27/auth",
                            ].includes(dep),
                    )
                    .concat([
                        ...(usesCobaltAuth
                            ? [
                                  "@openauthjs/openauth",
                                  ".cobalt/auth/oauth",
                                  "@standard-schema/spec",
                                  "aws4fetch",
                                  "jose",
                                  "zenstack",
                                  "@electric-sql/pglite",
                                  "@prisma/client",
                                  "@zenstackhq/runtime",
                                  "@zenstackhq/sdk",
                                  "pglite-prisma-adapter",
                                  "prisma",
                              ].concat(
                                  Object.keys(
                                      require(
                                          Bun.resolveSync(
                                              "@cobalt27/auth/package.json",
                                              process.cwd(),
                                          ),
                                      ).dependencies,
                                  ),
                              )
                            : []),
                        "@cobalt27/generate",
                        "dotenv",
                        "graphql",
                        "graphql-sse",
                        "@graphql-tools/schema",
                        "hono",
                        "hono/tiny",
                        "zod",
                    ]),
                packages: "bundle",
                tsconfig,
                target: "bun",
                // minify: true,
                sourcemap: "external",
            }).then((output) => {
                // write "#!/usr/bin/env bun" to the top of the file
                const file = path.join(output.outputs[0].path);
                const content = fs.readFileSync(file, "utf8");
                fs.writeFileSync(file, "#!/usr/bin/env bun\n" + content);
            });

            removeFile(path.join(outDir, "schema.graphql"));
            removeFile(path.join(outDir, "cobalt.server.ts"));
            removeFile(path.join(outDir, "util.ts"));
            removeFile(path.join(outDir, "cobalt-auth-sdk.ts"));
            removeFile(path.join(outDir, "cobalt-auth-compiled.ts"));

            if (options.docker) {
                // Create package.json for production
                const productionPackageJson = {
                    name: `${projectPackageJson.name}--cobalt-build`,
                    version: "1.0.0",
                    type: "module",
                    scripts: {
                        ...(projectPackageJson.scripts || {}),
                    },
                    dependencies: {
                        "@cobalt27/runtime": "latest",
                        ...(usesCobaltAuth
                            ? {
                                  "@cobalt27/auth": "latest",
                                  "@cobalt27/dev": "latest",
                                  zenstack: "2.16.1",
                                  "@electric-sql/pglite": "latest",
                              }
                            : {}),

                        graphql: "^16.8.1",
                        "graphql-sse": "^2.5.4",
                        "@graphql-tools/schema": "^10.0.0",
                        ...Object.fromEntries(
                            Object.entries(
                                projectPackageJson.dependencies,
                            ).filter(
                                ([dep]) =>
                                    ![
                                        "@cobalt27/runtime",
                                        "@cobalt27/auth",
                                        "@cobalt27/dev",
                                        "@cobalt27/generate",
                                    ].includes(dep),
                            ),
                        ),
                    },
                    devDependencies: {
                        ...Object.fromEntries(
                            Object.entries(
                                projectPackageJson.devDependencies,
                            ).filter(
                                ([dep]) =>
                                    ![
                                        "@cobalt27/runtime",
                                        "@cobalt27/auth",
                                        "@cobalt27/dev",
                                        "@cobalt27/generate",
                                    ].includes(dep),
                            ),
                        ),
                    },
                };

                writeFile(
                    path.join(outDir, "package.json"),
                    JSON.stringify(productionPackageJson, null, 2),
                );

                // detect if project uses prisma
                const hasPrisma =
                    projectPackageJson.dependencies?.["@prisma/client"] ||
                    projectPackageJson.devDependencies?.["@prisma/client"];
                let copiedEnvFile = false;
                let prismaConfigPathRelative: string | undefined;
                let prismaSchemaDirRelative: string | undefined;

                if (hasPrisma) {
                    // find prisma schema file
                    const prismaSchemaPath =
                        resolve(
                            path.join(process.cwd(), "prisma/schema.prisma"),
                        ) || resolve(path.join(process.cwd(), "schema.prisma"));

                    const prismaConfigPath = resolve(
                        path.join(process.cwd(), "prisma.config.ts"),
                    );
                    prismaConfigPathRelative = prismaConfigPath
                        ? path.relative(process.cwd(), prismaConfigPath)
                        : undefined;

                    if (prismaSchemaPath) {
                        const relativePath = path.dirname(
                            path.relative(process.cwd(), prismaSchemaPath),
                        );
                        prismaSchemaDirRelative = relativePath;

                        // copy prisma schema file
                        const prismaSchemaContent =
                            await Bun.file(prismaSchemaPath).text();

                        if (
                            prismaSchemaContent.includes("env(") ||
                            usesCobaltAuth
                        ) {
                            const envfile = resolve(".env");
                            if (envfile) {
                                writeFile(
                                    path.join(outDir, ".env"),
                                    await Bun.file(envfile).text(),
                                );
                                copiedEnvFile = true;
                            }
                        }

                        writeFile(
                            path.join(outDir, relativePath, "schema.prisma"),
                            prismaSchemaContent,
                        );
                    }
                    if (prismaConfigPath) {
                        writeFile(
                            path.join(outDir, "prisma.config.ts"),
                            await Bun.file(prismaConfigPath).text(),
                        );
                    }
                }

                const dockerInstallCommand =
                    options.dockerDebugWithLocalNpmRegistry
                        ? `RUN echo '[install]\\nregistry = { url = "http://host.docker.internal:4873", username = "admin", password = "admin" }' > ./bunfig.toml && bun install`
                        : `RUN bun install`;

                // Create Dockerfile
                const dockerfileContent = `FROM oven/bun:latest AS builder
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app
COPY . .
${dockerInstallCommand}

FROM oven/bun:latest
RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/cobalt.server.js ./cobalt.server.js
${prismaSchemaDirRelative ? `COPY --from=builder /app/${prismaSchemaDirRelative} ./${prismaSchemaDirRelative}` : ""}
${prismaConfigPathRelative ? `COPY --from=builder /app/${prismaConfigPathRelative} ./${prismaConfigPathRelative}` : ""}
${copiedEnvFile ? `COPY --from=builder /app/.env ./.env` : ""}

${usesCobaltAuth ? `ENV OPENAUTH_ISSUER=\${OPENAUTH_ISSUER:-http://localhost:4000}` : ""}
${usesCobaltAuth ? `ENV COBALT_AUTH_DATABASE_URL=\${COBALT_AUTH_DATABASE_URL:-/app/node_modules/.cobalt/auth/server/db/pglite_data}` : ""}
${
    usesCobaltAuth
        ? `
# For some reason, we need to run the init command twice to ensure the database is initialized. 
# There may be an error initially with wasm related to pglite. 
RUN bunx cobalt auth init && bunx cobalt auth init
`
        : ""
}

EXPOSE 4000
CMD ["bunx", "cobalt", "start"]
`;

                writeFile(path.join(outDir, "Dockerfile"), dockerfileContent);

                // Create .dockerignore
                const dockerignoreContent = `node_modules
.git
`;

                writeFile(
                    path.join(outDir, ".dockerignore"),
                    dockerignoreContent,
                );

                const t5 = performance.now();
                console.log(`✅ Build completed in ${(t5 - t1).toFixed(2)} ms`);
            }

            if (options.docker) {
                console.log(`
📦 Build artifacts created in: ${outDir}

🚀 To run the production server:
    bun cobalt start

🐳 To build and run with Docker:
    cd ${outDir}
    docker build -t cobalt-app .
    docker run -p 4000:4000 cobalt-app

📋 Files created:
    - cobalt.server.js (production server entry point)
    - package.json (production dependencies)
    - Dockerfile (container configuration)
    - .cobalt/ (generated schema and types)
`);
            } else {
                console.log(`
📦 Build artifacts created in: ${outDir}

🚀 To run the production server:
    bun cobalt start
`);
            }
        });

    return buildCmd;
};
