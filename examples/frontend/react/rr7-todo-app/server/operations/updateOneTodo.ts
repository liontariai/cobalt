import { Prisma } from "../../prisma/generated/client/client";

export async function Mutation(
    where: Omit<Prisma.TodoWhereUniqueInput, "AND" | "OR" | "NOT" | "ownerId">,
    data: Omit<Prisma.TodoUpdateInput, "ownerId">,
) {
    const { ownerId, prisma } = $$ctx(this);

    const todo = await prisma.todo.update({
        where: {
            ...where,
            ownerId,
        },
        data,
    });

    return todo;
}

export const __typename = "Todo";
