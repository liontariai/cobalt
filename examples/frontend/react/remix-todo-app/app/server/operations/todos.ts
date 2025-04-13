import { Prisma } from "@prisma/client";

/**
 *  Get all todos
 * @param where - The where clause to filter the todos
 * @returns The todos
 */
export async function Query(where?: Prisma.TodoWhereInput) {
    const { prisma } = $$ctx(this);

    return (
        await prisma.todo.findMany({
            where,
        })
    ).map((todo) => ({
        id: todo.id,
        text: todo.text,
        completed: todo.completed,
        createdAt: todo.createdAt,
    }));
}

export const __typename = "Todo";
