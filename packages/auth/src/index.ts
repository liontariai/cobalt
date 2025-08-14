import { issuer } from "@openauthjs/openauth";
import type { v1 } from "@standard-schema/spec";
import type {
    ObjectSchema,
    ObjectEntries,
    BaseSchema,
    BaseIssue,
    StringSchema,
} from "valibot";
import type {
    AuthorizationState,
    IssuerInput,
} from "@openauthjs/openauth/issuer";
import type { Provider } from "@openauthjs/openauth/provider/provider";
import type { Prettify } from "@openauthjs/openauth/util";
import {
    createSubjects,
    type SubjectSchema,
} from "@openauthjs/openauth/subject";
import { object } from "valibot";
import type { PrismaFields } from "./types";
import {
    generateSmCoAppFromOperations,
    makeCobaltAuthServer,
} from "./generate/samarium";
import {
    makeOpenAuthClient,
    rootBypassTokenFactory,
    writeOpenAuthClientTypes,
} from "./generate/openauth";
import { makeIdentityManagementPlatform } from "./generate/zenstack";
import fs from "fs";
import { findNodeModulesDir } from "./generate/helpers";
import path from "path";

export declare type CobaltAuthConfig = {
    clientId: string;
    issuer:
        | {
              oauth: undefined;
              cobalt: {
                  models: {
                      [modelName: string]: {
                          id: "String @id @default(ulid())";
                      } & {
                          [key: string]: PrismaFields;
                      };
                  };
                  subjects: {
                      [subjectName: string]: ObjectSchema<
                          {
                              [key: string]: BaseSchema<
                                  PrismaFields[keyof PrismaFields],
                                  PrismaFields[keyof PrismaFields],
                                  BaseIssue<PrismaFields[keyof PrismaFields]>
                              >;
                          },
                          undefined
                      >;
                  };
                  oauth: import(".cobalt/auth/oauth").client;
                  sdk: typeof import(".cobalt/auth/sdk");
                  authserver: import("hono/tiny").Hono<
                      {
                          Variables: {
                              authorization: import("@openauthjs/openauth/issuer").AuthorizationState;
                          };
                      },
                      {},
                      "/auth"
                  >;
              };
          }
        | {
              oauth: string | {};
              cobalt: undefined;
          };
};

async function initCobaltAuth<
    Models extends {
        [modelName: string]: {
            id: "String @id @default(ulid())";
        } & {
            [key: string]: PrismaFields;
        };
    },
    MK extends keyof Models,
    TokensConfig extends {
        [model in MK]: {
            id: StringSchema<undefined>;
        } & {
            [key in keyof Models[model] & string]?: v1.StandardSchema;
        };
    },
    TK extends keyof TokensConfig,
    Providers extends Record<string, Provider<any>>,
    Subjects extends SubjectSchema = {
        [subject in TK]: ObjectSchema<
            {
                [key in keyof TokensConfig[keyof TokensConfig]]: BaseSchema<
                    TokensConfig[subject][key],
                    v1.InferOutput<
                        Extract<
                            TokensConfig[subject][key],
                            Exclude<TokensConfig[subject][key], undefined>
                        >
                    >,
                    BaseIssue<TokensConfig[subject][key]>
                >;
            },
            undefined
        >;
    },
    Result = {
        [key in keyof Providers]: Prettify<
            {
                provider: key;
            } & (Providers[key] extends Provider<infer T> ? T : {})
        >;
    }[keyof Providers],
>(options: {
    models: Models;
    tokens: TokensConfig;
    providers: Providers;
    openauth: (sdk: {
        query: typeof import(".cobalt/auth/sdk").default.query;
        mutation: typeof import(".cobalt/auth/sdk").default.mutation;
    }) => Omit<
        IssuerInput<Providers, Subjects, Result>,
        "subjects" | "providers"
    >;
}) {
    return new Promise((resolve, reject) => {
        const { models, tokens, providers, openauth } = options;

        const cobaltAuthDir = path.join(
            findNodeModulesDir(),
            ".cobalt",
            "auth",
        );
        makeIdentityManagementPlatform({
            models,
        }).then((serverOperationsDir) => {
            generateSmCoAppFromOperations(serverOperationsDir).then(
                ({ sdkfile, makeSdkFetch }) => {
                    import(sdkfile).then(
                        (sdk: typeof import(".cobalt/auth/sdk")) => {
                            const createdOpenauthOptions = openauth({
                                query: sdk.default.query,
                                mutation: sdk.default.mutation,
                            });

                            const subjects = createSubjects(
                                Object.fromEntries(
                                    Object.entries(tokens).map(
                                        ([subject, schema]) => [
                                            subject,
                                            object(schema as ObjectEntries),
                                        ],
                                    ),
                                ),
                            );

                            const openauthOptions = {
                                subjects,
                                providers,
                                ...createdOpenauthOptions,
                            };

                            const openauthServer = issuer(openauthOptions);
                            const oauth = makeOpenAuthClient(
                                openauthServer,
                                subjects,
                            );
                            writeOpenAuthClientTypes(
                                process.env.COBALT_AUTH_CONFIG_FILEPATH!,
                            );

                            const sdkfetch = makeSdkFetch(oauth);
                            sdk.default.init({
                                auth: rootBypassTokenFactory,
                                fetcher: async (
                                    init: string | URL | Request,
                                    options?: RequestInit,
                                ) => {
                                    const res = await sdkfetch.fetch(
                                        new Request(init as string, options),
                                    );
                                    return res;
                                },
                            });

                            fs.writeFileSync(
                                path.join(cobaltAuthDir, "compiled.ts"),
                                `import * as types from "./server/$$types";
                                import * as resolvers from "./resolvers";
                                import ctx from "./server/ctx";
                                import schema from "./schema.graphql" with { type: "text" };
                                import zenstackPrismaSchema from "./server/db/schema/prisma/schema.prisma" with { type: "text" };
                                import prismaConfigTs from "./prisma.config.ts" with { type: "text" };
                                export { types, resolvers, schema, ctx, zenstackPrismaSchema, prismaConfigTs };
                                `.trim(),
                            );

                            resolve({
                                models,
                                subjects,
                                oauth,
                                sdk: sdk.default,
                                authserver: openauthServer,
                            });
                        },
                    );
                },
            );
        });
    }) as unknown as {
        models: Models;
        subjects: Subjects;
        oauth: import(".cobalt/auth/oauth").client;
        sdk: typeof import(".cobalt/auth/sdk");
        authserver: import("hono/tiny").Hono<
            {
                Variables: {
                    authorization: AuthorizationState;
                };
            },
            {},
            "/auth"
        >;
    };
}

export default function auth<
    Models extends {
        [modelName: string]: {
            id: "String @id @default(ulid())";
        } & {
            [key: string]: PrismaFields;
        };
    },
    MK extends keyof Models,
    TokensConfig extends {
        [model in MK]: {
            id: StringSchema<undefined>;
        } & {
            [key in keyof Models[model] & string]?: v1.StandardSchema;
        };
    },
    TK extends keyof TokensConfig,
    Providers extends Record<string, Provider<any>>,
    Subjects extends SubjectSchema = {
        [subject in TK]: ObjectSchema<
            {
                [key in keyof TokensConfig[keyof TokensConfig]]: BaseSchema<
                    TokensConfig[subject][key],
                    v1.InferOutput<
                        Extract<
                            TokensConfig[subject][key],
                            Exclude<TokensConfig[subject][key], undefined>
                        >
                    >,
                    BaseIssue<TokensConfig[subject][key]>
                >;
            },
            undefined
        >;
    },
    Result = {
        [key in keyof Providers]: Prettify<
            {
                provider: key;
            } & (Providers[key] extends Provider<infer T> ? T : {})
        >;
    }[keyof Providers],
>(options: {
    models: Models;
    tokens: TokensConfig;
    providers: Providers;
    openauth: (sdk: {
        query: typeof import(".cobalt/auth/sdk").default.query;
        mutation: typeof import(".cobalt/auth/sdk").default.mutation;
    }) => Omit<
        IssuerInput<Providers, Subjects, Result>,
        "subjects" | "providers"
    >;
}) {
    if (process.env.COBALT_AUTH_DEV) {
        return initCobaltAuth<
            Models,
            MK,
            TokensConfig,
            TK,
            Providers,
            Subjects,
            Result
        >(options) as unknown as {
            models: Models;
            subjects: Subjects;
            oauth: import(".cobalt/auth/oauth").client;
            sdk: typeof import(".cobalt/auth/sdk");
            authserver: import("hono/tiny").Hono<
                {
                    Variables: {
                        authorization: AuthorizationState;
                    };
                },
                {},
                "/auth"
            >;
        };
    }

    const { models, tokens, providers, openauth } = options;
    const sdk = require(".cobalt/auth/sdk");

    const createdOpenauthOptions = openauth({
        query: sdk.default.query,
        mutation: sdk.default.mutation,
    });

    const subjects = createSubjects(
        Object.fromEntries(
            Object.entries(tokens).map(([subject, schema]) => [
                subject,
                object(schema as ObjectEntries),
            ]),
        ),
    );
    const openauthOptions = {
        subjects,
        providers,
        ...createdOpenauthOptions,
    };
    const authserver = issuer(openauthOptions);
    const oauth = makeOpenAuthClient(authserver, subjects);

    const { resolvers, schema, ctx } = require(".cobalt/auth/compiled") as {
        resolvers: any;
        schema: string;
        ctx: any;
    };

    const cobaltAuthServer = makeCobaltAuthServer(
        resolvers,
        schema,
        ctx,
        oauth,
    );

    sdk.default.init({
        auth: rootBypassTokenFactory,
        fetcher: async (
            init: string | URL | Request,
            options?: RequestInit,
        ) => {
            return await cobaltAuthServer.fetch(
                new Request(init as string, options),
            );
        },
    });

    return {
        models,
        subjects,
        oauth,
        sdk,
        authserver,
    } as unknown as {
        models: Models;
        subjects: Subjects;
        oauth: import(".cobalt/auth/oauth").client;
        sdk: typeof import(".cobalt/auth/sdk");
        authserver: import("hono/tiny").Hono<
            {
                Variables: {
                    authorization: AuthorizationState;
                };
            },
            {},
            "/auth"
        >;
    };
}
