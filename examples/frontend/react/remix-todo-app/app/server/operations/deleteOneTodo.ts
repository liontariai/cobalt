import { Prisma } from "@prisma/client";

export async function Mutation(where: Prisma.TodoWhereUniqueInput) {
    const { ownerId, prisma } = $$ctx(this);

    const todo = await prisma.todo.delete({
        where: {
            id: where.id,
            AND: [where, { ownerId }],
        },
    });
    return todo;
}
