import auth from "@cobalt27/auth"; // re-export openauth from here, so user doesnt need to install & manage it

import { string } from "valibot";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { PasswordUI } from "@openauthjs/openauth/ui/password";

export default {
    clientId: "",
    issuer: {
        cobalt: auth({
            models: {
                user: {
                    id: "String @id @default(ulid())",
                    email: "String @unique",
                },
            },
            tokens: {
                user: {
                    id: string(),
                },
            },
            providers: {
                password: PasswordProvider(
                    PasswordUI({
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
                async allow({ clientID, redirectURI, audience }, req) {
                    return true;
                },
                start: async (req) => {},
                select: async (providers, req) => {
                    return Response.json({});
                },
                error: async (error, req) => {
                    return Response.json({ error: error.message });
                },
                success: async (ctx, value) => {
                    // if (value.provider === "password") {
                    //     const user = await sdk.query.adminCrudGetUser({
                    //         id: value.email,
                    //     })(({ id }) => ({ id }));
                    //     console.log(`userfound: ${user?.id}`);
                    //     if (!user?.id) {
                    //         console.log("User not found, creating...");
                    //         const newUser =
                    //             await sdk.mutation.adminCrudCreateUser({
                    //                 email: value.email,
                    //             })(({ id }) => ({ id }));
                    //         return ctx.subject("user", newUser);
                    //     }
                    //     return ctx.subject("user", user);
                    // }
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
