export async function Mutation(
    name: string,
    roles: { name: string; permissions: string[]; is_default: boolean }[],
) {
    const { prisma } = $$ctx(this);

    const res = await prisma.root.organization.create({
        data: {
            roles,
            name,
        },
    });

    return res;
}

export const __typename = "Organization";
