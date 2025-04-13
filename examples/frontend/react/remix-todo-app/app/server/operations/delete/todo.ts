import { Prisma } from "@prisma/client";

export async function Mutation(where: Prisma.TodoWhereUniqueInput) {
    const { prisma } = $$ctx(this);

    const todo = await prisma.todo.delete({
        where,
    });
    return todo;
}

export const __typename = "Todo";
