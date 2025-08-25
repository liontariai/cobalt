// prisma.config.ts
import { PGlite } from "@electric-sql/pglite";
import dotenv from "dotenv";
import path from "node:path";
import { PrismaPGlite } from "pglite-prisma-adapter";
import type { PrismaConfig } from "prisma";
dotenv.config({ path: ".env" });

export default {
    experimental: {
        adapter: true,
        studio: true,
    },
    schema: path.join("prisma", "schema.prisma"),
    adapter: async () => {
        const client = new PGlite({
            dataDir: process.env.DATABASE_URL,
        });
        return new PrismaPGlite(client);
    },
    studio: {
        adapter: async () => {
            const client = new PGlite({
                dataDir: process.env.DATABASE_URL,
            });
            return new PrismaPGlite(client);
        },
    },
} satisfies PrismaConfig;
