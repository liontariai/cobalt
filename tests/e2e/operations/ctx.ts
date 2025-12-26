// The `ctx.ts` file must use a default export to export an async function
// as the GraphQL context factory.
export default async function ({ headers }: CobaltCtxInput) {
    return {
        headers,
    };
}
