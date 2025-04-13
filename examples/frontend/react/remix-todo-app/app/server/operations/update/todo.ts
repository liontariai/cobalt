import { Prisma } from "@prisma/client";

export async function Mutation(
    where: Prisma.TodoWhereUniqueInput,
    data: Prisma.TodoUpdateInput,
) {
    const { prisma } = $$ctx(this);

    const todo = await prisma.todo.update({
        where,
        data,
    });

    return todo;
}

export const __typename = "Todo";
