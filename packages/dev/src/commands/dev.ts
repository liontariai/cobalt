/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import { Command } from "commander";
import type { AuthorizationState } from "@openauthjs/openauth/issuer";
import { createHandler } from "graphql-sse/lib/use/fetch";

// strange work around
import { makeGraphQLHandler } from "../util-2";

import { findOperationsDir, initializeAndCompile } from "./shared";
import path from "path";
import { watch } from "fs/promises";
import type { Server } from "bun";

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

            const startDev = async (prevServer?: Server) => {
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
                    this: Server,
                    req: Request,
                ) => Promise<Response> = async (req) => {
                    const path = new URL(req.url).pathname;
                    // handle cors
                    if (req.method === "OPTIONS") {
                        return new Response("OK", {
                            headers: corsifyHeaders(),
                        });
                    }

                    if (path === "/graphql") {
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
                    });
                    console.log(`🚀  Server ready at: ${httpServer.url}`);
                    return httpServer;
                }

                return prevServer;
            };

            let httpServer: Server | undefined;
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
