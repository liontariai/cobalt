import { resolveTypeWithSource } from "@cobalt27/generate/src/helpers";

import { createClient, type VerifyOptions } from "@openauthjs/openauth/client";
import { issuer } from "@openauthjs/openauth";
import type { ObjectSchema, ObjectEntries } from "valibot";
import path from "path";
import { findNodeModulesDir } from "./helpers";

let lastRootBypassToken = "";
export const rootBypassTokenFactory = () => {
    const token = crypto.randomUUID();
    lastRootBypassToken = token;
    return token;
};

export const makeOpenAuthClient = async (
    openauthServer: ReturnType<typeof issuer>,
    subjects: {
        [k: string]: ObjectSchema<ObjectEntries, undefined>;
    },
) => {
    const openauthClient = createClient({
        clientID: "internal",
        fetch: async (
            input: string | URL | globalThis.Request,
            init?: RequestInit,
        ) => {
            return await openauthServer.fetch(new Request(input, init));
        },
    });

    const { __Subjects__ } = resolveTypeWithSource(
        `
        import authconfig from "${process.env.authconfigfilepath!.replace(".ts", "")}";
        export {};
        `,
        {
            __Subjects__: "typeof authconfig.issuer.cobalt.subjects",
        },
    );

    const cobaltAuthDir = path.join(findNodeModulesDir(), ".cobalt", "auth");
    Bun.write(
        Bun.file(path.join(cobaltAuthDir, "oauth.ts")),
        `import type { v1 } from "@standard-schema/spec";
type Subjects = ${__Subjects__};
export type __Subjects__ = {
    [k in keyof Subjects]: v1.InferOutput<Subjects[k]>
};

type openauthClient = ReturnType<typeof import("@openauthjs/openauth/client").createClient>;
type VerifyOptions = import("@openauthjs/openauth/client").VerifyOptions;
export type client = {
    authorize: openauthClient["authorize"];
    exchange: openauthClient["exchange"];
    refresh: openauthClient["refresh"];
    verify: (token: string, options?: VerifyOptions) =>  Promise<import("@openauthjs/openauth/client").VerifyResult<Subjects> | import("@openauthjs/openauth/client").VerifyError>;
}
`,
    );

    const client = {
        authorize: openauthClient.authorize.bind(openauthClient),
        exchange: openauthClient.exchange.bind(openauthClient),
        refresh: openauthClient.refresh.bind(openauthClient),
        verify: (token: string, options?: VerifyOptions) => {
            if (token === lastRootBypassToken) {
                return {
                    subject: {
                        properties: {
                            id: `root:access::${lastRootBypassToken}`,
                        },
                    },
                };
            }
            return openauthClient.verify(subjects, token, options);
        },
    };

    return client;
};
