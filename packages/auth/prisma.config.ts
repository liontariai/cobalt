// prisma.config.ts
import path from "node:path";
import type { PrismaConfig } from "prisma";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import dotenv from "dotenv";
dotenv.config({ path: ".env.public" });

type Env = {
    DATABASE_URL?: string;
    COBALT_AUTH_DATABASE_URL?: string;
};

export default {
    earlyAccess: true,
    schema: path.join(
        "src",
        "server",
        "db",
        "schema",
        "prisma",
        "schema.prisma",
    ),
    migrate: {
        async adapter(env) {
            const client = new PGlite({
                dataDir: env.COBALT_AUTH_DATABASE_URL || env.DATABASE_URL,
            });
            return new PrismaPGlite(client);
        },
    },
    studio: {
        async adapter(env) {
            const client = new PGlite({
                dataDir: env.COBALT_AUTH_DATABASE_URL || env.DATABASE_URL,
            });
            return new PrismaPGlite(client);
        },
    },
} satisfies PrismaConfig<Env>;
