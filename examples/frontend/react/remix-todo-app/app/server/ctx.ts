import { PrismaClient, Todo } from "@prisma/client";

import { PubSub } from "./util/PubSub";

const pubSubTodos = new PubSub<Todo>();

export default async function ctx({ headers }: { headers: Headers }) {
    const prisma = new PrismaClient();
    const ownerId = headers.get("Authorization")!;

    return {
        headers,
        prisma,

        ownerId,

        pubsub: {
            todos: pubSubTodos,
        },
    };
}
