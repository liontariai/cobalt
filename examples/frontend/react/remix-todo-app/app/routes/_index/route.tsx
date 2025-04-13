import sdk, { _ } from "sdk";
import { useState } from "react";
import { TodoInput } from "@/routes/_index/TodoInput";
import { TodoItem } from "@/routes/_index/TodoItem";
import useSWR from "swr";

export const getTodos = sdk.query.todos(_)((s) => s.$scalars()).$lazy;
export const createTodo = sdk.mutation.createTodo(_)((s) => s.$scalars()).$lazy;
export const updateTodo = sdk.mutation.updateTodo(_)((s) => s.$scalars()).$lazy;
export const deleteTodo = sdk.mutation.deleteTodo(_)((s) => s.$scalars()).$lazy;

export default function Index() {
    const [searchText, setSearchText] = useState("");

    const { data: todos, mutate: mutateTodos } = useSWR(
        ["todos", searchText],
        () =>
            getTodos({
                where: {
                    text: {
                        contains: searchText || undefined,
                    },
                },
            }),
    );

    const [todoText, setTodoText] = useState("");
    const [showError, setShowError] = useState(false);

    const handleAddTodo = () => {
        if (todoText.trim() === "") {
            setShowError(true);
            setTimeout(() => setShowError(false), 3000);
            return;
        }
        createTodo({
            data: { text: todoText, completed: false },
        })
            .then(() => setTodoText(""))
            .then(() => mutateTodos());
    };

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl">
                <h1 className="text-4xl font-bold mb-8 text-center text-gray-800">
                    Beautiful Todo App
                </h1>
                <TodoInput
                    todoText={todoText}
                    setTodoText={setTodoText}
                    searchText={searchText}
                    setSearchText={setSearchText}
                    handleAddTodo={handleAddTodo}
                    showError={showError}
                    setShowError={setShowError}
                />
                <ul className="space-y-4">
                    {todos
                        ?.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
                        ?.sort((a, b) =>
                            a.completed ? 1 : b.completed ? -1 : 0,
                        )
                        .map((todo) => (
                            <TodoItem
                                key={todo.id}
                                todo={todo}
                                mutateTodos={mutateTodos}
                                animate={!searchText.length}
                            />
                        ))}
                </ul>
            </div>
        </div>
    );
}
