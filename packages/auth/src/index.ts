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
import { generateSmCoAppFromOperations } from "./generate/samarium";
import {
    makeOpenAuthClient,
    rootBypassTokenFactory,
} from "./generate/openauth";
import { makeIdentityManagementPlatform } from "./generate/zenstack";

export declare type CobaltAuthConfig = {
    clientId: string;
    issuer:
        | {
              oauth: undefined;
              cobalt: {
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
    if (process.env.buildtime) {
        return new Promise((resolve, reject) => {
            const { models, tokens, providers, openauth } = options;

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
                                makeOpenAuthClient(
                                    openauthServer,
                                    subjects,
                                ).then((client) => {
                                    const sdkfetch = makeSdkFetch(client);
                                    sdk.default.init({
                                        auth: rootBypassTokenFactory,
                                        fetcher: async (
                                            init: string | URL | Request,
                                            options: RequestInit,
                                        ) => {
                                            const res = await sdkfetch(
                                                new Request(init, options),
                                            );
                                            return res;
                                        },
                                    });
                                    resolve({
                                        oauth: client,
                                        sdk: sdk.default,
                                        subjects,
                                        authserver: openauthServer,
                                    });
                                });
                            },
                        );
                    },
                );
            });
        }) as unknown as {
            oauth: import(".cobalt/auth/oauth").client;
            sdk: typeof import(".cobalt/auth/sdk");
            subjects: Subjects;
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

    return {
        oauth: require(".cobalt/auth/oauth").client,
        sdk: require(".cobalt/auth/sdk"),
        subjects: undefined,
        authserver: undefined,
    } as unknown as {
        oauth: import(".cobalt/auth/oauth").client;
        sdk: typeof import(".cobalt/auth/sdk");
        subjects: Subjects;
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
