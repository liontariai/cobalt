import { Prisma } from "../../prisma/generated/client/client";

export async function Mutation(where: Prisma.TodoWhereUniqueInput) {
    const { prisma } = $$ctx(this);
    const {
        token: {
            subject: {
                properties: { email },
            },
        },
    } = $$auth(this);

    const todo = await prisma.todo.delete({
        where: {
            id: where.id,
            AND: [where, { ownerId: email }],
        },
    });
    return todo;
}
