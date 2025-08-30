import { Prisma } from "../../prisma/generated/client/client";

/**
 *  Get all todos
 * @param where - The where clause to filter the todos
 * @returns The todos
 */
export async function* Subscription(where: Prisma.TodoWhereInput) {
    const { pubsub } = $$ctx(this);
    const {
        token: {
            subject: {
                properties: { email },
            },
        },
    } = $$auth(this);

    for await (const todo of await pubsub.todos.asyncIterator("todos")) {
        // only stream todos from other users
        if (todo.ownerId !== email) {
            yield {
                id: todo.id,
                text: todo.text,
                completed: todo.completed,
                createdAt: todo.createdAt,
                by: todo.ownerId,
            };
        }
    }
}
