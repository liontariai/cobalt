export async function Mutation(
    orgid: string,
    data: {
        name?: string;
    },
) {
    const { prisma } = $$ctx(this);

    const res = await prisma.root.organization.update({
        where: { id: orgid },
        data: {
            name: data.name,
        },
    });

    return res;
}

export const __typename = "Organization";
