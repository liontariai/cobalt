import { Prisma } from "../../prisma/generated/client/client";

export async function Mutation(
    where: Omit<Prisma.TodoWhereUniqueInput, "AND" | "OR" | "NOT" | "ownerId">,
    data: Omit<Prisma.TodoUpdateInput, "ownerId">,
) {
    const { prisma } = $$ctx(this);
    const {
        token: {
            subject: {
                properties: { email },
            },
        },
    } = $$auth(this);

    const todo = await prisma.todo.update({
        where: {
            ...where,
            ownerId: email,
        },
        data,
    });

    return todo;
}

export const __typename = "Todo";
