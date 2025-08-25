import auth from "@cobalt27/auth";

import { string } from "valibot";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";

import { CodeProvider } from "@openauthjs/openauth/provider/code";
import { CodeUI } from "@openauthjs/openauth/ui/code";

export default {
    clientId: "client_id",
    issuer: {
        cobalt: auth({
            models: {
                user: {
                    id: "String @id @default(ulid())",
                },
            },
            tokens: {
                user: {
                    id: string(),
                },
            },
            providers: {
                code: CodeProvider<{ email: string }>(
                    CodeUI({
                        mode: "email",
                        sendCode: async (email, code) => {
                            console.log(email, code);
                        },
                    }),
                ),
            },
            openauth: (sdk) => ({
                storage: MemoryStorage({
                    persist: "./persist.json",
                }),
                success: async (ctx, value) => {
                    if (value.provider === "code") {
                        const email = value.claims.email;

                        const user = await sdk.mutation.adminAuthSignIn({
                            user_id: email,
                            claims: {
                                email,
                            },
                            provider: "email",
                        })(({ id }) => ({ id }));

                        if (!user?.id) {
                            throw new Error("User not found");
                        }

                        return ctx.subject("user", user);
                    }

                    throw new Error("Invalid provider");
                },
                ttl: {
                    access: 60 * 60 * 24 * 30,
                    refresh: 60 * 60 * 24 * 30 * 3,
                },
            }),
        }),
    },
};
