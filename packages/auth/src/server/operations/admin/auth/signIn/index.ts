import type { OpenIdClaims } from "@/db/zenstack/models";
import { getOrCreateUser } from "./password";
import { connectOpenId } from "./openid";

export async function Mutation(
    user_id: string,
    provider: "email" | keyof OpenIdClaims,
    claims: Exclude<
        { email: string } | OpenIdClaims[keyof OpenIdClaims],
        undefined | null
    >,
) {
    const ctx = $$ctx(this);

    const user_arn = `${provider}:(${user_id})`;

    if (provider === "email" && "email" in claims) {
        return getOrCreateUser(user_arn, claims.email!, ctx);
    } else if (provider !== "email" && "sub" in claims) {
        return connectOpenId(user_arn, provider, claims, ctx);
    }

    throw new Error("Invalid provider or claims");
}

export const __typename = "User";
