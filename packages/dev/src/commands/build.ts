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

// @ts-ignore
import server_code_as_string from "../server.ts" with { type: "text" };
// @ts-ignore
import server_util_code_as_string from "../util.ts" with { type: "text" };

export const buildCommand = (program: Command) => {
    const buildCmd = program
        .command("build")
        .description("Build the application for production")
        .option("--dir <dir>", "Directory to search for operation endpoints")
        .option("--out <path>", "Output directory for build artifacts", "dist")
        .option("--pretty", "Format the output graphql/openapi schema", false)
        .option(
            "--docker",
            "Build and prepare a directory with a Dockerfile",
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
            } = await initializeAndCompile(options);

            await Promise.all([
                writeSchemaOut(),
                writeTypesOut(),
                writeSdkOut(),
            ]);

            console.log(`📁 Operations directory: ${operationsDir}`);
            console.log(
                `📁 Output directory: ${path.relative(process.cwd(), outDir)}`,
            );

            let serverCodePatched = server_code_as_string
                .replace(
                    "let _ctxFile: any;",
                    `import ctxFile from process.env.COBALT_CTX_PATH; let _ctxFile = ctxFile;`,
                )
                .replace(
                    `let _resolversFile: any;`,
                    `import * as resolversFile from process.env.COBALT_RESOLVERS_PATH; let _resolversFile = resolversFile;`,
                )

                .replaceAll(
                    "process.env.COBALT_SCHEMA_PATH",
                    `"./schema.graphql"`,
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
                )
                .concat(
                    `
                    const httpServer = startServer();
                    console.log("🚀 Server started on port", httpServer.port);
                    `,
                );

            if (authFile) {
                serverCodePatched = serverCodePatched
                    .replace(
                        `let _cobaltAuth: any;`,
                        `
                        process.env.buildtime = "true";
                        process.env.authconfigfilepath = process.env.COBALT_AUTH_PATH!;
                        import cobaltAuth from process.env.COBALT_AUTH_PATH;
                        let _cobaltAuth = cobaltAuth;
                        `,
                    )
                    .replaceAll(
                        "process.env.COBALT_AUTH_PATH",
                        `"${path.relative(outDir, authFile)}"`,
                    );
            }

            writeFile(path.join(outDir, "schema.graphql"), schema);
            writeFile(path.join(outDir, "server.ts"), serverCodePatched);
            writeFile(path.join(outDir, "util.ts"), server_util_code_as_string);

            await Bun.build({
                entrypoints: [path.join(outDir, "server.ts")],
                outdir: outDir,
                banner: "var self = globalThis;",
                external: Object.keys(
                    require(path.join(process.cwd(), "package.json"))
                        .dependencies,
                )
                    .filter(
                        (dep) =>
                            ![
                                // embed these dependencies
                                "@cobalt27/runtime",
                            ].includes(dep),
                    )
                    .concat([
                        "graphql",
                        "graphql-sse",
                        "@graphql-tools/schema",
                    ]),
                target: "node",
                // minify: true,
                sourcemap: "external",
            });

            removeFile(path.join(outDir, "server.ts"));
            removeFile(path.join(outDir, "util.ts"));

            if (options.docker) {
                const usesCobaltAuth =
                    Object.keys(
                        require(path.join(process.cwd(), "package.json"))
                            .dependencies,
                    ).find((dep) => dep === "@cobalt27/auth") !== undefined;

                // Create package.json for production
                const productionPackageJson = {
                    name: require(path.join(process.cwd(), "package.json"))
                        .name,
                    version: "1.0.0",
                    type: "module",
                    scripts: {
                        ...(require(path.join(process.cwd(), "package.json"))
                            .scripts || {}),
                        "cobalt:server": "bun run server.js",
                    },
                    dependencies: {
                        "@cobalt27/runtime": "latest",
                        ...(usesCobaltAuth
                            ? {
                                  "@cobalt27/auth": "latest",
                                  "@cobalt27/generate": "latest",
                                  zenstack: "2.16.1",
                                  "@electric-sql/pglite": "latest",
                              }
                            : {}),

                        graphql: "^16.8.1",
                        "graphql-sse": "^2.5.4",
                        "@graphql-tools/schema": "^10.0.0",
                        ...Object.fromEntries(
                            Object.entries(
                                require(
                                    path.join(process.cwd(), "package.json"),
                                ).dependencies,
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
                                require(
                                    path.join(process.cwd(), "package.json"),
                                ).devDependencies,
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
                const prismaPackageJson = require(
                    path.join(process.cwd(), "package.json"),
                );
                const hasPrisma =
                    prismaPackageJson.dependencies?.["@prisma/client"] ||
                    prismaPackageJson.devDependencies?.["@prisma/client"];
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
                        ? `RUN bun install --registry=http://host.docker.internal:4873`
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
COPY --from=builder /app/schema.graphql ./schema.graphql
COPY --from=builder /app/server.js ./server.js
${prismaSchemaDirRelative ? `COPY --from=builder /app/${prismaSchemaDirRelative} ./${prismaSchemaDirRelative}` : ""}
${prismaConfigPathRelative ? `COPY --from=builder /app/${prismaConfigPathRelative} ./${prismaConfigPathRelative}` : ""}
${copiedEnvFile ? `COPY --from=builder /app/.env ./.env` : ""}

${usesCobaltAuth ? `ENV OPENAUTH_ISSUER=http://localhost:4000` : ""}

EXPOSE 4000
CMD ["bun", "cobalt:server"]
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
    - server.js (production server entry point)
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
