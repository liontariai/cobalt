import { Prisma } from "../../prisma/generated/client/client";

export async function Mutation(data: Omit<Prisma.TodoCreateInput, "ownerId">) {
    const { ownerId, prisma, pubsub } = $$ctx(this);

    const todo = await prisma.todo.create({
        data: {
            ...data,
            ownerId,
        },
    });

    pubsub.todos.publish("todos", todo);

    return todo;
}
