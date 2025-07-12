/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import { Command } from "commander";
import type { AuthorizationState } from "@openauthjs/openauth/issuer";
import type { CobaltAuthConfig } from "@cobalt27/auth";
import { createHandler } from "graphql-sse/lib/use/fetch";

// strange work around
import { makeGraphQLHandler } from "../util-2";

import { initializeAndCompile, resolve } from "./shared";
import path from "path";

export const devCommand = (program: Command) => {
    const devCmd = program
        .command("dev")
        .description("Start the development server")
        .option("--dir <dir>", "Directory to search for operation endpoints")
        .option("--sdk-out <path>", "Custom path to save the samarium-sdk to")
        .option("--gql", "Use GraphQL", true)
        .option("--rest", "Use REST", false)
        .option("-p, --port <port>", "Port to run the server on", "4000")
        .option("-w, --watch", "Watch for changes and restart the server")
        .option("--pretty", "Format the output graphql/openapi schema", true)
        .action(async (options) => {
            const {
                operationsDir,
                ctxFile,
                gqlSchema,
                writeSchemaOut,
                // writeResolversOut,
                writeTypesOut,
                writeSdkOut,
            } = await initializeAndCompile(options);

            await Promise.all([
                writeSchemaOut(),
                // writeResolversOut(),
                writeTypesOut(),
                writeSdkOut(),
            ]);

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

            const authConfigFile =
                resolve(path.join(operationsDir, "..", "auth.ts")) ||
                resolve(path.join(operationsDir, "..", "auth.dev.ts"));

            if (!authConfigFile) {
                console.log(
                    "No `auth.ts` found. No authentication configured.",
                );
            } else {
                process.env.buildtime = "true";
                process.env.authconfigfilepath = authConfigFile!;
                const authConfig = (await import(authConfigFile!))
                    .default as CobaltAuthConfig;

                const {
                    issuer: { cobalt },
                } = authConfig;

                cobaltAuth = {
                    oauth: undefined,
                    cobalt: (await Promise.resolve(cobalt))!,
                };
                authserver = cobaltAuth?.cobalt?.authserver;
            }

            const ctx = (await import(ctxFile)).default as CobaltCtxFactory;
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

            const httpServer = Bun.serve({
                port: +options.port,
                idleTimeout: 0,
                fetch: async (req, httpserver) => {
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
                },
            });

            console.log(`🚀  Server ready at: ${httpServer.url}`);
        });

    return devCmd;
};
