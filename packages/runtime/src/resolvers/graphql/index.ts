type CTX = {
    __cobalt: CobaltGlobalObject["__cobalt"];
    headers: Headers;
};

const makeAuthedCTX = async (ctx: CTX) => {
    // const __cobalt = ctx.__cobalt as CobaltGlobalObject["__cobalt"];

    // const cobaltAuth = __cobalt?.auth;
    // const token = ctx.headers.get("Authorization") ?? "";
    // const authed = await cobaltAuth?.cobalt?.oauth?.verify(token);
    // if (authed?.err) {
    //     throw authed.err;
    // }

    // const $$auth = authed && {
    //     token: authed,
    //     query: cobaltAuth?.cobalt?.sdk.query,
    //     mutation: cobaltAuth?.cobalt?.sdk.mutation,
    // };

    const that = {
        $$ctx: {
            ...ctx,
            // $$auth,
        },
    };

    return that;
};

export const makeGraphQLResolverFn = <T, A extends any[]>(
    fn: (...args: A) => T,
    fieldName: string,
    isSubscription?: boolean,
) => {
    if (isSubscription) {
        return {
            subscribe: async function* resolver(
                this: any,
                parent: any,
                args: A,
                context: CTX,
                info: any,
            ) {
                const that = await makeAuthedCTX(context);

                const asyncGen = fn.bind(that)(
                    ...(Object.values(args) as A),
                ) as AsyncGenerator<T, any, any>;

                for await (const item of asyncGen) {
                    yield { [fieldName]: item };
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
        const that = await makeAuthedCTX(context);
        return await fn.bind(that)(...(Object.values(args) as A));
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
