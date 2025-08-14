import fs from "fs";
import path from "path";
import { Hono } from "hono/tiny";

import { Generator } from "@cobalt27/generate";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLGenerator, Flavors } from "@samarium.sdk/make";
import { findNodeModulesDir } from "./helpers";
import type { makeOpenAuthClient } from "./openauth";

import { createHandler } from "graphql-sse/lib/use/fetch";
import { makeGraphQLHandler } from "./graphql-util";

export const generateSmCoAppFromOperations = async (operationsDir: string) => {
    const generator = new Generator();
    const { schema, entrypoint, tsTypes } =
        await generator.generate(operationsDir);

    const cobaltAuthDir = path.join(findNodeModulesDir(), ".cobalt", "auth");
    const ctxfile = path.resolve(operationsDir, "..", "ctx.ts");

    const resolversfile = path.join(cobaltAuthDir, "resolvers.ts");
    fs.writeFileSync(resolversfile, entrypoint);

    fs.mkdirSync(path.join(cobaltAuthDir, "server", "$$types"), {
        recursive: true,
    });
    for (const [fname, fcontent] of Object.entries(tsTypes)) {
        fs.writeFileSync(
            path.join(cobaltAuthDir, "server", "$$types", `${fname}.ts`),
            fcontent,
        );
    }

    fs.writeFileSync(path.join(cobaltAuthDir, "schema.graphql"), schema);

    const gqlSchema = makeExecutableSchema({
        typeDefs: schema,
        resolvers: require(resolversfile),
    });

    const sdk = await new GraphQLGenerator.Generator(
        Flavors.GraphQL.default,
    ).generate({
        schema: gqlSchema,
        options: {},
        authConfig: {
            headerName: "Authorization",
        },
    });

    const sdkfile = path.join(cobaltAuthDir, "sdk.ts");

    fs.writeFileSync(
        sdkfile,
        sdk
            .replaceAll("[AUTH_HEADER_NAME]", "Authorization")
            .replaceAll("[ENDPOINT]", `http://localhost:4000/graphql`),
    );

    const makeHonoProxy = (
        openauthClient: Awaited<ReturnType<typeof makeOpenAuthClient>>,
    ) => {
        const hono = makeCobaltAuthServer(
            require(resolversfile),
            schema,
            require(ctxfile).default as CobaltCtxFactory,
            openauthClient,
        );
        return hono;
    };

    return { sdkfile, makeSdkFetch: makeHonoProxy };
};

export const makeCobaltAuthServer = (
    resolvers: any,
    schema: string,
    ctx: CobaltCtxFactory,
    oauth: Awaited<ReturnType<typeof makeOpenAuthClient>>,
) => {
    const gqlSchema = makeExecutableSchema({
        typeDefs: schema,
        resolvers,
    });

    const ctxFactory = async (req: Request) => ({
        headers: req.headers,
        __cobalt: {
            auth: {},
        },
        ...(await ctx({
            oauth: oauth as any,
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

    const hono = new Hono();
    hono.use("*", async (c) => {
        const path = new URL(c.req.raw.url).pathname;
        // handle cors
        if (c.req.method === "OPTIONS") {
            return new Response("OK", {
                headers: corsifyHeaders(),
            });
        }

        if (path === "/graphql") {
            // handle non-sse requests
            if (
                !c.req.raw.headers.get("accept")?.includes("text/event-stream")
            ) {
                try {
                    const resp = await graphqlHandler(c.req.raw);
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
                const respWithStream = await sse(c.req.raw);
                const stream = respWithStream.body as ReadableStream;

                return new Response(stream, {
                    headers: {
                        ...corsifyHeaders(new Headers(respWithStream.headers)),
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

        return new Response("Not Found", { status: 404 });
    });

    return hono;
};
