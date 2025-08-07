// prisma.config.ts
import path from "node:path";
import type { PrismaConfig } from "prisma";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import dotenv from "dotenv";
dotenv.config({ path: ".env.public" });

export default {
    experimental: {
        adapter: true,
    },
    schema: path.join(
        "src",
        "server",
        "db",
        "schema",
        "prisma",
        "schema.prisma",
    ),
    adapter: async () => {
        const client = new PGlite({
            dataDir:
                process.env.COBALT_AUTH_DATABASE_URL ||
                process.env.DATABASE_URL,
        });
        return new PrismaPGlite(client);
    },
} satisfies PrismaConfig;
