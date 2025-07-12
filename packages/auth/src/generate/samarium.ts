import path from "path";
import { Hono } from "hono/tiny";

import { Generator } from "@cobalt27/generate";
import { makeExecutableSchema } from "@graphql-tools/schema";
import {
    ApolloServer,
    HeaderMap,
    type HTTPGraphQLRequest,
} from "@apollo/server";

import { GraphQLGenerator, Flavors } from "@samarium.sdk/make";
import { findNodeModulesDir } from "./helpers";
import type { makeOpenAuthClient } from "./openauth";

export const generateSmCoAppFromOperations = async (operationsDir: string) => {
    const generator = new Generator();
    const { schema, entrypoint, tsTypes } =
        await generator.generate(operationsDir);

    const cobaltAuthDir = path.join(findNodeModulesDir(), ".cobalt", "auth");
    const ctxfile = path.resolve(operationsDir, "..", "ctx.ts");

    const resolversfile = path.join(cobaltAuthDir, "resolvers.ts");
    await Bun.write(Bun.file(resolversfile), entrypoint);

    for (const [fname, fcontent] of Object.entries(tsTypes)) {
        await Bun.write(
            Bun.file(
                path.join(cobaltAuthDir, "server", "$$types", `${fname}.ts`),
            ),
            fcontent,
        );
    }

    await Bun.write(
        Bun.file(path.join(cobaltAuthDir, "schema.graphql")),
        schema,
    );

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

    await Bun.write(
        Bun.file(sdkfile),
        sdk
            .replaceAll("[AUTH_HEADER_NAME]", "Authorization")
            .replaceAll("[ENDPOINT]", `http://localhost:4000/graphql`),
    );

    const server = new ApolloServer({
        schema: gqlSchema,
    });
    await server.start();

    const makeHonoProxy = (
        openauthClient: Awaited<ReturnType<typeof makeOpenAuthClient>>,
    ) => {
        const hono = new Hono();
        hono.use("/graphql", async (c) => {
            const headers = new Headers([["Content-Type", "application/json"]]);
            for (const [key, value] of Object.entries(
                c.req.raw.headers.toJSON(),
            )) {
                if (value !== undefined) {
                    headers.set(
                        key.toLowerCase(),
                        Array.isArray(value) ? value.join(", ") : value,
                    );
                }
            }
            const body = await c.req.json();
            const httpGraphQLRequest: HTTPGraphQLRequest = {
                method: c.req.method.toUpperCase(),
                headers: headers as unknown as HeaderMap,
                search: new URL(c.req.raw.url).search ?? "",
                body,
            };
            const result = await server.executeHTTPGraphQLRequest({
                httpGraphQLRequest,
                context: async () => ({
                    headers: c.req.raw.headers,
                    __cobalt: {
                        auth: {},
                    },
                    ...(await require(ctxfile).default({
                        oauth: openauthClient,
                        headers: c.req.raw.headers,
                    })),
                }),
            });

            let response: Response;
            if (result.body.kind === "complete") {
                response = new Response(result.body.string, {
                    status: result.status || 200,
                    headers: Object.fromEntries(result.headers.entries()),
                });
            } else {
                const resultBody = result.body.asyncIterator;
                response = new Response({
                    [Symbol.asyncIterator]: async function* () {
                        for await (const chunk of resultBody) {
                            yield chunk;
                        }
                    },
                } as any);
            }

            return response;
        });
        return hono.fetch;
    };

    return { sdkfile, makeSdkFetch: makeHonoProxy };
};
