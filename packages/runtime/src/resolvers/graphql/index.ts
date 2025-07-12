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

export const makeGraphQLResolverFn = <T, A extends any[]>(
    fn: (...args: A) => T,
    fieldName: string,
    isSubscription?: boolean,
) => {
    const debugLogStart = (args: A, context: CTX) => {
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
                args: A,
                context: CTX,
                info: any,
            ) {
                const [t0, logStart] = debugLogStart(args, context) ?? [];

                const that = await makeAuthedCTX(context);

                const asyncGen = fn.bind(that)(
                    ...(Object.values(args) as A),
                ) as AsyncGenerator<T, any, any>;

                for await (const item of asyncGen) {
                    yield { [fieldName]: item };
                    if (t0 && logStart) {
                        const logEnd = debugLogEnd(t0, logStart, item);
                        console.debug("\x1b[34m%s\x1b[0m", logEnd);
                    }
                }
            },
        };
    }

    return async function resolver(
        this: any,
        parent: any,
        args: A,
        context: CTX,
        info: any,
    ) {
        const [t0, logStart] = debugLogStart(args, context) ?? [];

        const that = await makeAuthedCTX(context);
        const result = await fn.bind(that)(...(Object.values(args) as A));

        if (t0 && logStart) {
            const logEnd = debugLogEnd(t0, logStart, result);
            console.debug("\x1b[34m%s\x1b[0m", logEnd);
        }

        return result;
    };
};

export const makeGraphQLFieldResolver = <T, A extends any[]>(
    fn: (...args: A) => T,
) => {
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
        return await fn.bind(that)(...(Object.values(args) as A));
    };
};
