import { Prisma } from "@prisma/client";

/**
 *  Get all todos
 * @param where - The where clause to filter the todos
 * @returns The todos
 */
export async function Query(
    where?: Omit<Prisma.TodoWhereInput, "AND" | "OR" | "NOT" | "ownerId">,
) {
    const { ownerId, prisma } = $$ctx(this);

    return (
        await prisma.todo.findMany({
            where: {
                ...where,
                ownerId,
            },
        })
    ).map((todo) => ({
        id: todo.id,
        text: todo.text,
        completed: todo.completed,
        createdAt: todo.createdAt,
        by: todo.ownerId,
    }));
}

export const __typename = "TodoWithBy";
