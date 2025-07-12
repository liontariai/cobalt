export async function Mutation() {
    const ctx = $$ctx(this);
    const auth = $$auth(this);

    await ctx.prisma.root.user.update({
        where: {
            id: auth.token.subject.properties.id,
        },
        data: {},
    });

    return {
        test: "test",
    };
}
