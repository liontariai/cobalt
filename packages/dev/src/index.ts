/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import fs from "fs";
import path from "path";

import { Command } from "commander";
import { Generator } from "@cobalt27/generate";

import { makeExecutableSchema } from "@graphql-tools/schema";

import { GraphQLGenerator, Flavors } from "@samarium.sdk/make";
// import type { AuthorizationState } from "@openauthjs/openauth/issuer";
// import type { CobaltAuthConfig } from "@cobalt27/auth";

import { createHandler } from "graphql-sse/lib/use/fetch";
import { makeGraphQLHandler } from "./util";
import prettier from "prettier";

const cwd = process.cwd();

const resolve = (p: string, check = true) => {
    const resolved = path.resolve(cwd, p);
    if (check && !fs.existsSync(resolved)) {
        return undefined;
    }
    return resolved;
};

const program = new Command();
program.name("Cobalt");
program.version("0.0.1");
program.option(
    "--dir <dir>",
    "Directory to search for operation endpoints",
    "operations",
);
program.option("--sdk-out <path>", "Custom path to save the samarium-sdk to");
program.option("--gql", "Use GraphQL", true);
program.option("--rest", "Use REST", false);
program.option("-p, --port <port>", "Port to run the server on", "4000");
program.option("-w, --watch", "Watch for changes and restart the server");
program.option("--pretty", "Format the output graphql/openapi schema", false);
program.parse(process.argv);
const options = program.opts();

const operationsDir =
    resolve(options.dir || "operations" || "src/operations") ||
    resolve(`src/${options.dir}`);

if (!operationsDir) {
    console.error(
        `Directory (${options.dir}) not found, could not find operations.`,
    );
    process.exit(1);
}

const t1 = performance.now();
const generator = new Generator();
let { schema, entrypoint, tsTypes } = await generator.generate(operationsDir);
const t2 = performance.now();
console.log(`🚀  Generator took ${(t2 - t1).toFixed(2)} ms`);

if (options.pretty) {
    schema = await prettier.format(schema, { parser: "graphql" });
}

await Bun.write(Bun.file(resolve("./.cobalt/schema.graphql", false)!), schema);
await Bun.write(
    Bun.file(resolve("./.cobalt/resolvers.ts", false)!),
    entrypoint,
);
for (const [fname, fcontent] of Object.entries(tsTypes)) {
    await Bun.write(
        Bun.file(resolve(`./.cobalt/$$types/${fname}.ts`, false)!),
        fcontent,
    );
}

const gqlSchema = makeExecutableSchema({
    typeDefs: schema,
    resolvers: {
        ...require(resolve("./.cobalt/resolvers.ts", false)!),
    },
});

// let authserver:
//     | import("hono/tiny").Hono<
//           {
//               Variables: {
//                   authorization: AuthorizationState;
//               };
//           },
//           {},
//           "/auth"
//       >
//     | undefined;
// let cobaltAuth: CobaltAuthConfig["issuer"];

// const authConfigFile =
//     resolve(path.join(operationsDir, "..", "auth.ts")) ||
//     resolve(path.join(operationsDir, "..", "auth.dev.ts"));

const t3 = performance.now();
const sdk = await new GraphQLGenerator.Generator(
    Flavors.GraphQL.default,
).generate({
    schema: gqlSchema,
    options: {},
    // authConfig: authConfigFile
    //     ? {
    //           headerName: "Authorization",
    //       }
    //     : undefined,
});
const t4 = performance.now();
console.log(`🚀  SDK took ${(t4 - t3).toFixed(2)} ms`);

const sdkout = options.sdkOut ?? resolve("./.cobalt/sdk.ts", false)!;

const port = options.port || 4000;
Bun.write(
    Bun.file(sdkout),
    sdk
        .replaceAll("[AUTH_HEADER_NAME]", "Authorization")
        .replaceAll("[ENDPOINT]", `http://localhost:${port}/graphql`),
);

// if (!authConfigFile)
//     console.log("No `auth.ts` found. No authentication configured.");
// else {
//     process.env.buildtime = "true";
//     process.env.authconfigfilepath = authConfigFile!;
//     const authConfig = (await import(authConfigFile!))
//         .default as CobaltAuthConfig;
//     const {
//         issuer: { cobalt },
//     } = authConfig;
//     cobaltAuth = {
//         oauth: undefined,
//         cobalt: (await Promise.resolve(cobalt))!,
//     };
//     authserver = cobaltAuth?.cobalt?.authserver;
// }
const ctxFile = resolve(path.join(operationsDir, "..", "ctx.ts"));
if (!ctxFile) throw new Error("The ctx.ts file is mandatory!");
const ctx = (await import(ctxFile)).default as CobaltCtxFactory;
const ctxFactory = async (req: Request) => ({
    headers: req.headers,
    __cobalt: {
        // auth: cobaltAuth,
    },
    ...(await ctx({
        // oauth: cobaltAuth?.cobalt?.oauth,
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

const httpServer = Bun.serve({
    port: +port,
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
                const resp = await graphqlHandler(req);
                return new Response(resp.body, {
                    status: resp.status || 200,
                    headers: {
                        ...corsifyHeaders(new Headers(resp.headers)),
                    },
                });
            }

            // For SSE requests, directly return the response from the SSE handler
            // which already contains a proper streaming response
            const respWithStream = await sse(req);
            const stream = respWithStream.body as ReadableStream;

            return new Response(stream, {
                headers: {
                    ...corsifyHeaders(new Headers(respWithStream.headers)),
                    "Content-Type": "text/event-stream",
                },
                status: respWithStream.status,
                statusText: respWithStream.statusText,
            });
        }

        // if (authserver) {
        //     return await authserver.fetch(req);
        // }

        return new Response("Not Found", { status: 404 });
    },
});

console.log(`🚀  Server ready at: ${httpServer.url}`);
