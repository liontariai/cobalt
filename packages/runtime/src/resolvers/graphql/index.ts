type CTX = {
    __cobalt: CobaltGlobalObject["__cobalt"];
    headers: Headers;
};

const makeAuthedCTX = async (ctx: CTX) => {
    const __cobalt = ctx.__cobalt as CobaltGlobalObject["__cobalt"];

    const cobaltAuth = __cobalt?.auth;
    const token = ctx.headers.get("Authorization") ?? "";
    const authed = await cobaltAuth?.cobalt?.oauth?.verify(token);
    if (authed?.err) {
        throw authed.err;
    }

    const $$auth = authed && {
        token: authed,
        query: cobaltAuth?.cobalt?.sdk.query,
        mutation: cobaltAuth?.cobalt?.sdk.mutation,
    };

    const that = {
        $$ctx: {
            ...ctx,
            $$auth,
        },
    };

    return that;
};

type ResolverArgs = Record<string, any>;

export const makeGraphQLResolverFn = <T, A extends any[]>(
    fn: (...args: A) => T,
    fieldName: string,
    argsMap?: Record<string, number>,
    isSubscription?: boolean,
) => {
    argsMap = argsMap ?? {};

    const debugLogStart = (args: ResolverArgs, context: CTX) => {
        if (process.env.DEBUG) {
            return [
                Date.now(),
                `
    [${new Date().toLocaleString()}]
    ${fieldName}(${Object.entries(args)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(", ")})
            `,
            ] as const;
        }
    };
    const debugLogEnd = (t0: number, logStart: string, result: T) => {
        if (process.env.DEBUG) {
            const resultString = JSON.stringify(result);
            return `
    ${logStart}
    ${resultString.slice(0, 100) + (resultString.length > 100 ? "..." : "")}
    [${Date.now() - t0}ms]
    [${(resultString.length / 1024).toFixed(3)} kb]
            `;
        }
    };

    if (isSubscription) {
        return {
            subscribe: async function* resolver(
                this: any,
                parent: any,
                args: ResolverArgs,
                context: CTX,
                info: any,
            ) {
                const [t0, logStart] = debugLogStart(args, context) ?? [];

                const that = await makeAuthedCTX(context);

                const argsInOrder = Array.from({ length: Object.keys(argsMap).length });
                for (const argName in argsMap) {
                    argsInOrder[argsMap[argName]] = args[argName];
                }

                const asyncGen = fn.bind(that)(
                    ...(argsInOrder as A),
                ) as AsyncGenerator<T, any, any>;

                try {
                    for await (const item of asyncGen) {
                        yield { [fieldName]: item };
                        if (t0 && logStart) {
                            const logEnd = debugLogEnd(t0, logStart, item);
                            console.debug("\x1b[34m%s\x1b[0m", logEnd);
                        }
                    }
                } finally {
                    await asyncGen.return(undefined);
                }
            },
        };
    }

    return async function resolver(
        this: any,
        parent: any,
        args: ResolverArgs,
        context: CTX,
        info: any,
    ) {
        const [t0, logStart] = debugLogStart(args, context) ?? [];

        const that = await makeAuthedCTX(context);

        const argsInOrder = Array.from({ length: Object.keys(argsMap).length });
        for (const argName in argsMap) {
            argsInOrder[argsMap[argName]] = args[argName];
        }

        const result = await fn.bind(that)(...(argsInOrder as A));

        if (t0 && logStart) {
            const logEnd = debugLogEnd(t0, logStart, result);
            console.debug("\x1b[34m%s\x1b[0m", logEnd);
        }

        return result;
    };
};

export const makeGraphQLFieldResolver = <T, A extends any[]>(
    fn: (...args: A) => T,
    // fieldName: string,
    // argsMap?: Record<string, number>,
) => {
    // argsMap = argsMap ?? {};

    // const debugLogStart = (args: ResolverArgs, context: CTX) => {
    //     if (process.env.DEBUG) {
    //         return [
    //             Date.now(),
    //             `
    // [${new Date().toLocaleString()}]
    // ${fieldName}(${Object.entries(args)
    //     .map(([key, value]) => `${key}: ${value}`)
    //     .join(", ")})
    //         `,
    //         ] as const;
    //     }
    // };
    // const debugLogEnd = (t0: number, logStart: string, result: T) => {
    //     if (process.env.DEBUG) {
    //         const resultString = JSON.stringify(result);
    //         return `
    // ${logStart}
    // ${resultString.slice(0, 100) + (resultString.length > 100 ? "..." : "")}
    // [${Date.now() - t0}ms]
    // [${(resultString.length / 1024).toFixed(3)} kb]
    //         `;
    //     }
    // };


    return async function resolver(
        this: any,
        parent: any,
        args: A,
        context: CTX,
        info: any,
    ) {
        const that = {
            ...(await makeAuthedCTX(context)),
            $$root: {
                ...parent,
            },
        };
        // const [t0, logStart] = debugLogStart(args, context) ?? [];

        // const argsInOrder = Array.from({ length: Object.keys(argsMap).length });
        // for (const argName in argsMap){
        //     argsInOrder[argsMap[argName]] = args[argName];
        // }

        const result = await fn.bind(that)(...(Object.values(args) as A));

        // if (t0 && logStart) {
        //     const logEnd = debugLogEnd(t0, logStart, result);
        //     console.debug("\x1b[34m%s\x1b[0m", logEnd);
        // }

        return result;
    };
};
