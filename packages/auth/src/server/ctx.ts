import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";

import type { PrismaClient } from "./db/zenstack/models";
import { PrismaClient as PPrismaClient } from "./db/schema/@prisma/client/client";
import { enhance } from "./db/zenstack/enhance";

import dotenv from "dotenv";
dotenv.config({ path: ".env.public" });

const client = new PGlite(
    process.env.COBALT_AUTH_DATABASE_URL! || process.env.DATABASE_URL!,
);
const adapter = new PrismaPGlite(client);

export default async function ({
    oauth,
    headers,
}: {
    oauth?: import(".cobalt/auth/oauth").client;
    headers: Headers;
}) {
    if (!oauth) throw new Error("Cobalt Auth is not set up correctly!");

    const token = headers.get("Authorization") ?? "";
    const authed = await oauth.verify(token);

    if (authed.err) {
        throw authed.err;
    }

    const rawDbPrisma = new PPrismaClient({ adapter });

    const enhancedDbPrisma = enhance(rawDbPrisma as any) as PrismaClient;
    const authedPrisma = enhance(rawDbPrisma as any, {
        user: authed.subject.properties,
    }) as PrismaClient;

    return {
        prisma: {
            raw: rawDbPrisma,
            root: enhancedDbPrisma,
            authed: authedPrisma,
        },
    };
}
