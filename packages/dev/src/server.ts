import type { CobaltAuthConfig } from "@cobalt27/auth";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { createHandler } from "graphql-sse/lib/use/fetch";
import { makeGraphQLHandler } from "./util";
import { readFileSync } from "fs";

let _schema: string | undefined;
let _ctxFile: any;
let _resolversFile: any;
let _cobaltAuth: any;

if (process.env.COMPILE_TIME) {
} else {
    _ctxFile = require(process.env.COBALT_CTX_PATH!);
    _resolversFile = require(process.env.COBALT_RESOLVERS_PATH!);
    _cobaltAuth = require(process.env.COBALT_AUTH_CONFIG_FILEPATH!);
}

if (!_schema) {
    _schema = readFileSync(process.env.COBALT_SCHEMA_PATH!, "utf8");
}

let cobaltAuth: CobaltAuthConfig["issuer"] | undefined;
if (!_cobaltAuth) {
    console.log("No `auth.ts` found. No authentication configured.");
} else {
    process.env.COBALT_AUTH_DEV = "true";
    process.env.COBALT_AUTH_CONFIG_FILEPATH =
        process.env.COBALT_AUTH_CONFIG_FILEPATH!;
    const authConfig = _cobaltAuth.default as CobaltAuthConfig;

    const {
        issuer: { cobalt },
    } = authConfig;

    cobaltAuth = {
        oauth: undefined,
        cobalt: (await Promise.resolve(cobalt))!,
    };
}

const port = process.env.COBALT_PORT || process.env.PORT || 4000;

const gqlSchema = makeExecutableSchema({
    typeDefs: _schema!,
    resolvers: _resolversFile,
});

const ctx = _ctxFile.default as CobaltCtxFactory;
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
const graphqlHandler = makeGraphQLHandler(gqlSchema, ctxFactory as any);

const corsifyHeaders = (headers?: Headers) => {
    return {
        ...Object.entries(headers ?? {}),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };
};

export const startServer = () => {
    return Bun.serve({
        hostname: "0.0.0.0",
        port: +port!,
        reusePort: true,
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
                if (!req.headers.get("accept")?.includes("text/event-stream")) {
                    try {
                        const resp = await graphqlHandler(req);
                        return new Response(resp.body, {
                            status: resp.status || 200,
                            headers: {
                                ...corsifyHeaders(new Headers(resp.headers)),
                            },
                        });
                    } catch (e) {
                        console.error("Error in graphqlHandler", e);
                        return new Response("Internal Server Error", {
                            status: 500,
                        });
                    }
                }

                // For SSE requests, directly return the response from the SSE handler
                // which already contains a proper streaming response
                try {
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
                } catch (e) {
                    console.error("Error in sse", e);
                    return new Response("Internal Server Error", {
                        status: 500,
                    });
                }
            }

            if (cobaltAuth?.cobalt?.authserver) {
                try {
                    return await cobaltAuth.cobalt.authserver.fetch(req);
                } catch (e) {
                    console.error("Error in authserver", e);
                    return new Response("Internal Server Error", {
                        status: 500,
                    });
                }
            }

            return new Response("Not Found", { status: 404 });
        },
    });
};
