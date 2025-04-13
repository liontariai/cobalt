import { Prisma } from "@prisma/client";

export async function Mutation(data: Prisma.TodoCreateInput) {
    const { prisma } = $$ctx(this);

    const todo = await prisma.todo.create({
        data,
    });

    return todo;
}

export const __typename = "Todo";
