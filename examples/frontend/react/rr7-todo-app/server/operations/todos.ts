import { Prisma } from "../../prisma/generated/client/client";

/**
 *  Get all todos
 * @param where - The where clause to filter the todos
 * @returns The todos
 */
export async function Query(
    where?: Omit<Prisma.TodoWhereInput, "AND" | "OR" | "NOT" | "ownerId">,
) {
    const { prisma } = $$ctx(this);
    const {
        token: {
            subject: {
                properties: { email },
            },
        },
    } = $$auth(this);

    return (
        await prisma.todo.findMany({
            where: {
                ...where,
                ownerId: email,
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
