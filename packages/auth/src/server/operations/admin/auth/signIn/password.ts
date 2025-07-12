export async function getOrCreateUser(
    user_arn: string,
    email: string,
    ctx: ReturnType<typeof $$ctx>,
) {
    const { prisma } = ctx;

    const user = await prisma.root.user.findUnique({
        where: {
            user_arn,
        },
    });

    if (user) {
        return user;
    }

    const res = await prisma.root.user.create({
        data: {
            user_arn,
            emails: [
                {
                    email,
                    verified: true,
                    primary: true,
                },
            ],
        },
    });

    return res;
}
