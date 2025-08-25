import sdk, { _, type TodoWithBy } from "sdk";
import { useMemo, useState } from "react";
import { TodoInput } from "@/routes/_index/TodoInput";
import { TodoItem } from "@/routes/_index/TodoItem";
import { useAsyncIterable } from "@/hooks/useAsyncGen";
import useSWR from "swr";

export const getTodos = sdk.query.todos(_)((s) => s.$all({})).$lazy;
export const createTodo = sdk.mutation.createOneTodo(_)((s) =>
    s.$all({}),
).$lazy;
export const updateTodo = sdk.mutation.updateOneTodo(_)((s) =>
    s.$all({}),
).$lazy;
export const deleteTodo = sdk.mutation.deleteOneTodo(_)((s) =>
    s.$all({}),
).$lazy;

export const streamTodos = sdk.subscription.streamTodos(_)((s) =>
    s.$all({}),
).$lazy;

export default function Index() {
    const [userId, setUserId] = useState(() => {
        if (typeof window === "undefined") {
            return "";
        }
        return window.localStorage.getItem("userid") ?? "";
    });

    const [searchText, setSearchText] = useState("");
    const [todoText, setTodoText] = useState("");
    const [showError, setShowError] = useState(false);

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

    const [streamedTodos, setStreamedTodos] = useState<TodoWithBy[]>([]);
    useAsyncIterable(
        async () => await streamTodos({ where: {} }),
        (todo) => {
            setStreamedTodos((t) => [...t, todo]);
        },
        () => {},
    );

    const allTodos = useMemo(
        () => [...(todos ?? []), ...streamedTodos],
        [todos, streamedTodos],
    );

    return (
        <div className="relative min-h-screen bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center p-4">
            <div className="absolute top-4 right-4">
                <input
                    type="text"
                    placeholder="Enter username"
                    value={userId}
                    onChange={(e) => {
                        const value = e.target.value;
                        if (value) {
                            setUserId(value);
                        } else {
                            setUserId("");
                        }

                        if (typeof window !== "undefined") {
                            window.localStorage.setItem("userid", value);
                            sdk.init({
                                headers: {
                                    Authorization: value,
                                },
                            });
                        }
                    }}
                    className="px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                />
            </div>
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
                    {allTodos
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
