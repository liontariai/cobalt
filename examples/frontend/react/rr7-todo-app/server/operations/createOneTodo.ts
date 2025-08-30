import { Prisma } from "../../prisma/generated/client/client";

export async function Mutation(data: Omit<Prisma.TodoCreateInput, "ownerId">) {
    const { prisma, pubsub } = $$ctx(this);
    const {
        token: {
            subject: {
                properties: { email },
            },
        },
    } = $$auth(this);

    const todo = await prisma.todo.create({
        data: {
            ...data,
            ownerId: email,
        },
    });

    pubsub.todos.publish("todos", todo);

    return todo;
}
