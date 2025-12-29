/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import { Command } from "commander";
import type { AuthorizationState } from "@openauthjs/openauth/issuer";
import { createHandler } from "graphql-sse/lib/use/fetch";
import type { Server } from "bun";
import type { BunWebSocketData } from "hono/bun";

// strange work around
import { makeGraphQLHandler } from "../util-2";

import { findOperationsDir, initializeAndCompile } from "./shared";
import path from "path";
import { watch } from "fs/promises";

import ts from "typescript";
import tar from "tar-stream";

type CobaltAuthConfig = import("@cobalt27/auth").CobaltAuthConfig;

export const devCommand = (program: Command) => {
    const devCmd = program
        .command("dev")
        .description("Start the development server")
        .option("--dir <dir>", "Directory to search for operation endpoints")
        .option("--sdk-out <path>", "Custom path to save the samarium-sdk to")
        .option("--gql", "Use GraphQL", true)
        .option("--rest", "Use REST", false)
        .option("-p, --port <port>", "Port to run the server on", "4000")
        .option("--pretty", "Format the output graphql/openapi schema", true)
        .action(async (options) => {
            const dir = findOperationsDir(options.dir);
            if (!dir) {
                console.error(
                    `Directory (${options.dir}) not found, could not find operations.`,
                );
                process.exit(1);
            }

            const serverDir = path.resolve(dir!, "..");

            const startDev = async (prevServer?: Server<BunWebSocketData>) => {
                let authserver:
                    | import("hono/tiny").Hono<
                          {
                              Variables: {
                                  authorization: AuthorizationState;
                              };
                          },
                          {},
                          "/auth"
                      >
                    | undefined;
                let cobaltAuth: CobaltAuthConfig["issuer"];

                let {
                    ctxFile,
                    gqlSchema,
                    writeSchemaOut,
                    writeTypesOut,
                    writeSdkOut,
                } = await initializeAndCompile(
                    options,
                    async (authConfigFile) => {
                        process.env.COBALT_AUTH_DEV = "true";
                        process.env.COBALT_AUTH_CONFIG_FILEPATH =
                            authConfigFile!;

                        if (require.cache[authConfigFile!]) {
                            delete require.cache[authConfigFile!];
                        }
                        const authConfig = (
                            require(authConfigFile!) as {
                                default: CobaltAuthConfig;
                            }
                        ).default;

                        const {
                            issuer: { cobalt },
                        } = authConfig;

                        cobaltAuth = {
                            oauth: undefined,
                            cobalt: (await Promise.resolve(cobalt))!,
                        };
                        authserver = cobaltAuth?.cobalt?.authserver;
                    },
                );

                await Promise.all([
                    writeSchemaOut(),
                    writeTypesOut(),
                    writeSdkOut(),
                ]);

                if (require.cache[ctxFile]) {
                    delete require.cache[ctxFile];
                }
                const ctx = (
                    require(ctxFile) as {
                        default: CobaltCtxFactory;
                    }
                ).default;

                const ctxFactory = async (req: Request) => ({
                    headers: req.headers,
                    __cobalt: {
                        auth: cobaltAuth,
                    },
                    ...(await ctx({
                        oauth: cobaltAuth?.cobalt?.oauth,
                        headers: req.headers as any,
                    })),
                });

                const sse = createHandler({
                    schema: gqlSchema,
                    context: ctxFactory as any,
                });
                const graphqlHandler = makeGraphQLHandler(
                    gqlSchema,
                    ctxFactory as any,
                );

                const corsifyHeaders = (headers?: Headers) => {
                    return {
                        ...Object.entries(headers ?? {}),
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                        "Access-Control-Allow-Headers":
                            "Content-Type, Authorization",
                    };
                };

                const fetchFn: (
                    this: Server<BunWebSocketData>,
                    req: Request,
                ) => Promise<Response> = async (req) => {
                    const path = new URL(req.url).pathname;
                    // handle cors
                    if (req.method === "OPTIONS") {
                        return new Response("OK", {
                            headers: corsifyHeaders(),
                        });
                    }

                    if (path === "/graphql" || path === "/cobalt") {
                        // handle non-sse requests
                        if (
                            !req.headers
                                .get("accept")
                                ?.includes("text/event-stream")
                        ) {
                            const resp = await graphqlHandler(req);
                            return new Response(resp.body, {
                                status: resp.status || 200,
                                headers: {
                                    ...corsifyHeaders(
                                        new Headers(resp.headers),
                                    ),
                                },
                            });
                        }

                        // For SSE requests, directly return the response from the SSE handler
                        // which already contains a proper streaming response
                        const respWithStream = await sse(req);
                        const stream = respWithStream.body as ReadableStream;

                        return new Response(stream, {
                            headers: {
                                ...corsifyHeaders(
                                    new Headers(respWithStream.headers),
                                ),
                                "Content-Type": "text/event-stream",
                            },
                            status: respWithStream.status,
                            statusText: respWithStream.statusText,
                        });
                    }

                    if (path.startsWith("/cobalt/sdk")) {
                        const Samarium = await import("@samarium.sdk/make");
                        const sdk =
                            await new Samarium.GraphQLGenerator.Generator(
                                Samarium.Flavors.GraphQL.default,
                            ).generate({
                                schema: gqlSchema,
                                options: {},
                                authConfig: {
                                    headerName: "Authorization",
                                },
                            });

                        const sdkContent = sdk
                            .replaceAll("[AUTH_HEADER_NAME]", "Authorization")
                            .replaceAll(
                                "[ENDPOINT]",
                                `${req.url.slice(0, req.url.indexOf("/cobalt/sdk"))}/cobalt`,
                            );

                        // In-memory file system (map of file paths to contents)
                        const memoryFiles: Map<string, string> = new Map();

                        // Function to compile TS source in memory
                        function compileInMemory(
                            fileName: string,
                            source: string,
                            options: ts.CompilerOptions = {},
                        ) {
                            // Default options (customize as needed)
                            const compilerOptions: ts.CompilerOptions = {
                                ...options,
                                lib: ["DOM", "DOM.Iterable", "ES2022"],
                                target: ts.ScriptTarget.ES2022,
                                module: ts.ModuleKind.ES2022,
                                moduleResolution:
                                    ts.ModuleResolutionKind.Bundler,
                                esModuleInterop: true,
                                verbatimModuleSyntax: true,
                                resolveJsonModule: true,
                                skipLibCheck: true,
                                strict: true,
                                noImplicitThis: false,
                                declaration: true, // Enable .d.ts generation
                                noEmitOnError: false, // Emit even if errors
                                // Add other options like lib: ["es2020"], etc.
                            };

                            // Store the input source in memory
                            memoryFiles.set(fileName, source);

                            // Custom compiler host for in-memory operations
                            const host: ts.CompilerHost = {
                                getSourceFile: (
                                    fName: string,
                                    languageVersion: ts.ScriptTarget,
                                ) => {
                                    const content = memoryFiles.get(fName);
                                    if (content !== undefined) {
                                        return ts.createSourceFile(
                                            fName,
                                            content,
                                            languageVersion,
                                        );
                                    }
                                    // For built-in libs (e.g., lib.d.ts), fall back to default host
                                    return ts.getDefaultLibFilePath(
                                        compilerOptions,
                                    ) === fName
                                        ? ts.createSourceFile(
                                              fName,
                                              ts.sys.readFile(fName) || "",
                                              languageVersion,
                                          )
                                        : undefined;
                                },
                                writeFile: (fName, content) => {
                                    memoryFiles.set(fName, content); // Capture output in memory
                                },
                                getDefaultLibFileName: () =>
                                    ts.getDefaultLibFilePath(compilerOptions),
                                useCaseSensitiveFileNames: () => false,
                                getCanonicalFileName: (fName) => fName,
                                getCurrentDirectory: () => "",
                                getNewLine: () => "\n",
                                fileExists: (fName) =>
                                    memoryFiles.has(fName) ||
                                    ts.sys.fileExists(fName),
                                readFile: (fName) =>
                                    memoryFiles.get(fName) ||
                                    ts.sys.readFile(fName),
                                directoryExists: () => true,
                                getDirectories: () => [],
                            };

                            // Create the program
                            const program = ts.createProgram(
                                [fileName],
                                compilerOptions,
                                host,
                            );

                            // Get pre-emit diagnostics
                            const preEmitDiagnostics =
                                ts.getPreEmitDiagnostics(program);

                            // Emit (JS and .d.ts)
                            const emitResult = program.emit();

                            // Combine all diagnostics
                            const allDiagnostics = [
                                ...preEmitDiagnostics,
                                ...emitResult.diagnostics,
                            ];

                            // Extract outputs (adjust paths if using outDir or rootDir)
                            const jsFileName = fileName.replace(/\.ts$/, ".js");
                            const dtsFileName = fileName.replace(
                                /\.ts$/,
                                ".d.ts",
                            );

                            return {
                                js: memoryFiles.get(jsFileName),
                                dts: memoryFiles.get(dtsFileName),
                                tsconfig: JSON.stringify(
                                    {
                                        include: ["*.ts"],
                                        compilerOptions: {
                                            ...compilerOptions,
                                            target: Object.entries(
                                                ts.ScriptTarget,
                                            ).find(
                                                ([key, value]) =>
                                                    value ===
                                                    compilerOptions.target!,
                                            )?.[0],
                                            module: Object.entries(
                                                ts.ModuleKind,
                                            ).find(
                                                ([key, value]) =>
                                                    value ===
                                                    compilerOptions.module!,
                                            )?.[0],
                                            moduleResolution: Object.entries(
                                                ts.ModuleResolutionKind,
                                            ).find(
                                                ([key, value]) =>
                                                    value ===
                                                    compilerOptions.moduleResolution!,
                                            )?.[0],
                                        },
                                    },
                                    null,
                                    2,
                                ),
                                diagnostics: allDiagnostics,
                            };
                        }

                        const { js, dts, tsconfig } = compileInMemory(
                            "index.ts",
                            sdkContent,
                        );

                        const files = new Map<string, Uint8Array>();
                        files.set(
                            "package/package.json",
                            new TextEncoder().encode(
                                JSON.stringify(
                                    {
                                        name: "cobalt-sdk",
                                        version: "1.1.0",
                                        main: "index.js",
                                    },
                                    null,
                                    2,
                                ),
                            ),
                        );
                        files.set(
                            "package/index.js",
                            new TextEncoder().encode(js),
                        );
                        files.set(
                            "package/index.d.ts",
                            new TextEncoder().encode(dts),
                        );
                        files.set(
                            "package/tsconfig.json",
                            new TextEncoder().encode(tsconfig),
                        );

                        // Generate tarball in memory using tar-stream
                        const pack = tar.pack();
                        const chunks: Buffer[] = [];

                        pack.on("data", (chunk: Buffer) => {
                            chunks.push(Buffer.from(chunk));
                        });

                        // Wait for the pack stream to finish
                        await new Promise<void>((resolve, reject) => {
                            pack.on("end", resolve);
                            pack.on("error", reject);

                            // Add each file to the tar archive
                            for (const [filePath, content] of files.entries()) {
                                const entry = pack.entry(
                                    {
                                        name: filePath,
                                        size: content.length,
                                    },
                                    (err?: Error | null) => {
                                        if (err) {
                                            reject(err);
                                        }
                                    },
                                );
                                if (entry) {
                                    entry.write(Buffer.from(content));
                                    entry.end();
                                }
                            }

                            // Finalize the pack
                            pack.finalize();
                        });

                        // Collect the full tarball buffer
                        const tarballBuffer = Buffer.concat(chunks);

                        // Compress the tarball with gzip (npm/bun expect .tar.gz format)
                        const gzippedBuffer = Bun.gzipSync(tarballBuffer);

                        return new Response(gzippedBuffer, {
                            headers: {
                                "Content-Type": "application/gzip",
                                "Content-Disposition": `attachment; filename="cobalt-sdk-1.0.0.tar.gz"`,
                                "Content-Length":
                                    gzippedBuffer.length.toString(),
                            },
                        });
                    }

                    if (authserver) {
                        return await authserver.fetch(req);
                    }

                    return new Response("Not Found", { status: 404 });
                };

                if (prevServer) {
                    prevServer.reload({
                        fetch: fetchFn,
                    });
                } else {
                    const httpServer = Bun.serve({
                        port: +options.port,
                        idleTimeout: 0,
                        fetch: fetchFn,
                        reusePort: true,
                    });
                    console.log(`🚀  Server ready at: ${httpServer.url}`);
                    return httpServer;
                }

                return prevServer;
            };

            let httpServer: Server<BunWebSocketData> | undefined;
            httpServer = await startDev();
            console.log("🔍 Watching for changes...");

            const watcher = watch(serverDir, { recursive: true });
            for await (const event of watcher) {
                if (event.filename) {
                    console.log(
                        `🔍 Detected ${event.eventType} in ${event.filename}`,
                    );
                    const changedFile = Bun.resolveSync(
                        `./${event.filename}`,
                        serverDir,
                    );
                    if (require.cache[changedFile]) {
                        delete require.cache[changedFile];
                    }
                }
                httpServer = await startDev(httpServer);
            }
        });

    return devCmd;
};
