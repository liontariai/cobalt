import { useState, useEffect } from "react";

/**
 * Hook to consume an AsyncIterable and return its latest yielded value
 * @param {() => Promise<AsyncIterable<T, R, D>>} makeIterable - The async generator to run
 * @param {(value: T) => void} onValue - The callback to call when a value is yielded
 * @param {(error: Error) => void} onError - The callback to call when an error occurs
 * @param {any[]} deps - Dependency array for re-running the generator
 * @returns {Object} - { value, error, done }
 * @example
 * const { value, error, done } = useAsyncIterable(
 *     () => async function*() {
 *         yield "Hello";
 *         yield "World";
 *     },
 *     (value) => console.log(value),
 */
export function useAsyncIterable<T, R, D>(
    makeIterable: () => Promise<AsyncIterable<T, R, any>>,
    onValue: (value: T) => void,
    onError: (error: Error) => void,
    deps: D[] = [],
) {
    const [state, setState] = useState<{
        value: T | null;
        error: Error | null;
        done: boolean;
    }>({
        value: null,
        error: null,
        done: false,
    });

    useEffect(() => {
        let mounted = true;

        (async () => {
            const iterator = await makeIterable();
            try {
                for await (const value of iterator) {
                    if (!mounted) {
                        setState({ value: null, error: null, done: true });
                        break;
                    }
                    setState({ value, error: null, done: false });
                    onValue(value);
                }
            } catch (error: any) {
                if (mounted) {
                    setState({ value: null, error, done: false });
                    onError(error);
                }
            }
        })();

        // Cleanup: stop the generator on unmount or dep change
        return () => {
            mounted = false;
        };
    }, deps); // Re-run if dependencies change

    return state;
}
