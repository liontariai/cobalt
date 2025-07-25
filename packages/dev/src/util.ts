import {
    Source,
    parse,
    execute,
    validateSchema,
    validate,
    specifiedRules,
    getOperationAST,
    GraphQLError,
} from "graphql";

import type {
    GraphQLSchema,
    DocumentNode,
    FormattedExecutionResult,
    GraphQLFormattedError,
} from "graphql";

import type { Context } from "hono";

async function parseBody(req: Request): Promise<Record<string, unknown>> {
    const contentType = req.headers.get("content-type");

    switch (contentType) {
        case "application/graphql":
            return { query: await req.text() };
        case "application/json":
            try {
                return await req.json();
            } catch (e) {
                if (e instanceof Error) {
                    console.error(`${e.stack || e.message}`);
                }
                throw Error(`POST body sent invalid JSON: ${e}`);
            }
        case "application/x-www-form-urlencoded":
            return parseFormURL(req);
    }

    return {};
}

const parseFormURL = async (req: Request) => {
    const text = await req.text();
    const searchParams = new URLSearchParams(text);
    const res: { [params: string]: string } = {};
    searchParams.forEach((v, k) => (res[k] = v));
    return res;
};

export const makeGraphQLHandler = <S extends GraphQLSchema>(
    schema: S,
    ctxFactory: (req: Request) => Promise<Context>,
): ((req: Request) => Promise<Response>) => {
    return async (req: Request) => {
        // GraphQL HTTP only supports GET and POST methods.
        if (req.method !== "GET" && req.method !== "POST") {
            return new Response(
                JSON.stringify(
                    errorMessages([
                        "GraphQL only supports GET and POST requests.",
                    ]),
                ),
                {
                    status: 405,
                    headers: {
                        Allow: "GET, POST",
                    },
                },
            );
        }

        let params: GraphQLParams;
        try {
            params = await getGraphQLParams(req);
        } catch (e) {
            if (e instanceof Error) {
                console.error(`${e.stack || e.message}`);
                return new Response(
                    JSON.stringify(errorMessages([e.message], [e])),
                    {
                        status: 400,
                    },
                );
            }
            throw e;
        }

        const { query, variables, operationName } = params;

        if (query == null) {
            // if (showGraphiQL && req.method === "GET") {
            //     return respondWithGraphiQL(req);
            // }
            return new Response(
                JSON.stringify(errorMessages(["Must provide query string."])),
                {
                    status: 400,
                },
            );
        }

        const schemaValidationErrors = validateSchema(schema);
        if (schemaValidationErrors.length > 0) {
            // Return 500: Internal Server Error if invalid schema.
            return new Response(
                JSON.stringify(
                    errorMessages(
                        ["GraphQL schema validation error."],
                        schemaValidationErrors,
                    ),
                ),
                {
                    status: 500,
                },
            );
        }

        let documentAST: DocumentNode;
        try {
            documentAST = parse(new Source(query, "GraphQL request"));
        } catch (syntaxError: unknown) {
            // Return 400: Bad Request if any syntax errors errors exist.
            if (syntaxError instanceof Error) {
                console.error(`${syntaxError.stack || syntaxError.message}`);
                const e = new GraphQLError(syntaxError.message, {
                    originalError: syntaxError,
                });
                return new Response(
                    JSON.stringify(
                        errorMessages(["GraphQL syntax error."], [e]),
                    ),
                    {
                        status: 400,
                    },
                );
            }
            throw syntaxError;
        }

        // Validate AST, reporting any errors.
        const validationErrors = validate(schema, documentAST, [
            ...specifiedRules,
            // ...validationRules,
        ]);

        if (validationErrors.length > 0) {
            // Return 400: Bad Request if any validation errors exist.
            return new Response(
                JSON.stringify(
                    errorMessages(
                        ["GraphQL validation error."],
                        validationErrors,
                    ),
                ),
                {
                    status: 400,
                },
            );
        }

        if (req.method === "GET") {
            // Determine if this GET request will perform a non-query.
            const operationAST = getOperationAST(documentAST, operationName);
            if (operationAST && operationAST.operation !== "query") {
                // Otherwise, report a 405: Method Not Allowed error.
                return new Response(
                    JSON.stringify(
                        errorMessages([
                            `Can only perform a ${operationAST.operation} operation from a POST request.`,
                        ]),
                    ),
                    {
                        status: 405,
                        headers: { Allow: "POST" },
                    },
                );
            }
        }

        let result: FormattedExecutionResult;
        // const { rootResolver } = options;

        try {
            result = await execute({
                schema,
                document: documentAST,
                // rootValue: rootResolver ? await rootResolver(c) : null,
                contextValue: await ctxFactory(req),
                variableValues: variables,
                operationName: operationName,
            });
        } catch (contextError: unknown) {
            if (contextError instanceof Error) {
                console.error(`${contextError.stack || contextError.message}`);
                const e = new GraphQLError(contextError.message, {
                    originalError: contextError,
                    nodes: documentAST,
                });
                // Return 400: Bad Request if any execution context errors exist.
                return new Response(
                    JSON.stringify(
                        errorMessages(
                            ["GraphQL execution context error."],
                            [e],
                        ),
                    ),
                    {
                        status: 400,
                    },
                );
            }
            throw contextError;
        }

        if (!result.data) {
            if (result.errors) {
                return new Response(
                    JSON.stringify(
                        errorMessages(
                            [result.errors.toString()],
                            result.errors,
                        ),
                    ),
                    {
                        status: 500,
                    },
                );
            }
        }

        // if (pretty) {
        //     const payload = JSON.stringify(result, null, pretty ? 2 : 0);
        //     return c.text(payload, 200, {
        //         "Content-Type": "application/json",
        //     });
        // } else {
        //     return c.json(result);
        // }
        return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    };
};

interface GraphQLParams {
    query: string | null;
    variables: { readonly [name: string]: unknown } | null;
    operationName: string | null;
    raw: boolean;
}

const getGraphQLParams = async (request: Request): Promise<GraphQLParams> => {
    const urlData = new URLSearchParams(request.url.split("?")[1]);
    const bodyData = await parseBody(request);

    // GraphQL Query string.
    let query = urlData.get("query") ?? (bodyData.query as string | null);

    if (typeof query !== "string") {
        query = null;
    }

    // Parse the variables if needed.
    let variables = (urlData.get("variables") ?? bodyData.variables) as {
        readonly [name: string]: unknown;
    } | null;
    if (typeof variables === "string") {
        try {
            variables = JSON.parse(variables);
        } catch {
            throw Error("Variables are invalid JSON.");
        }
    } else if (typeof variables !== "object") {
        variables = null;
    }

    // Name of GraphQL operation to execute.
    let operationName =
        urlData.get("operationName") ??
        (bodyData.operationName as string | null);
    if (typeof operationName !== "string") {
        operationName = null;
    }

    const raw = urlData.get("raw") != null || bodyData.raw !== undefined;

    const params: GraphQLParams = {
        query: query,
        variables: variables,
        operationName: operationName,
        raw: raw,
    };

    return params;
};

const errorMessages = (
    messages: string[],
    graphqlErrors?: readonly GraphQLError[] | readonly GraphQLFormattedError[],
) => {
    if (graphqlErrors) {
        return {
            errors: graphqlErrors,
        };
    }

    return {
        errors: messages.map((message) => {
            return {
                message: message,
            };
        }),
    };
};

export const respondWithGraphiQL = (c: Context) => {
    // https://github.com/graphql/graphiql/blob/85edb9e0505db8ff963c9ad4674bc8fa2e02a35a/examples/graphiql-cdn/index.html
    return c.html(`<!--
  *  Copyright (c) 2021 GraphQL Contributors
  *  All rights reserved.
  *
  *  This source code is licensed under the license found in the
  *  LICENSE file in the root directory of this source tree.
  -->
  <!doctype html>
  <html lang="en">
    <head>
      <title>GraphiQL</title>
      <style>
        body {
          height: 100%;
          margin: 0;
          width: 100%;
          overflow: hidden;
        }
  
        #graphiql {
          height: 100vh;
        }
      </style>
      <!--
        This GraphiQL example depends on Promise and fetch, which are available in
        modern browsers, but can be "polyfilled" for older browsers.
        GraphiQL itself depends on React DOM.
        If you do not want to rely on a CDN, you can host these files locally or
        include them directly in your favored resource bundler.
      -->
      <script
        crossorigin
        src="https://unpkg.com/react@18/umd/react.development.js"
      ></script>
      <script
        crossorigin
        src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"
      ></script>
      <!--
        These two files can be found in the npm module, however you may wish to
        copy them directly into your environment, or perhaps include them in your
        favored resource bundler.
      -->
      <script
        src="https://unpkg.com/graphiql/graphiql.min.js"
        type="application/javascript"
      ></script>
      <link rel="stylesheet" href="https://unpkg.com/graphiql/graphiql.min.css" />
      <!--
        These are imports for the GraphIQL Explorer plugin.
      -->
      <script
        src="https://unpkg.com/@graphiql/plugin-explorer/dist/index.umd.js"
        crossorigin
      ></script>
  
      <link
        rel="stylesheet"
        href="https://unpkg.com/@graphiql/plugin-explorer/dist/style.css"
      />
    </head>
  
    <body>
      <div id="graphiql">Loading...</div>
      <script>
        const root = ReactDOM.createRoot(document.getElementById('graphiql'));
        const fetcher = GraphiQL.createFetcher({
          url: '${c.req.path}',
        });
        const explorerPlugin = GraphiQLPluginExplorer.explorerPlugin();
        root.render(
          React.createElement(GraphiQL, {
            fetcher,
            defaultEditorToolsVisibility: true,
            plugins: [explorerPlugin],
          }),
        );
      </script>
    </body>
  </html>
  `);
};
