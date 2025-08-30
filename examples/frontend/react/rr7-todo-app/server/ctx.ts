import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient, type Todo } from "../prisma/generated/client/client";

import { PubSub } from "./util/PubSub";

const client = new PGlite(process.env.DATABASE_URL!);
const adapter = new PrismaPGlite(client);

const pubSubTodos = new PubSub<Todo>();

export default async function ctx({ headers }: { headers: Headers }) {
    const prisma = new PrismaClient({ adapter });

    return {
        headers,
        prisma,

        pubsub: {
            todos: pubSubTodos,
        },
    };
}
