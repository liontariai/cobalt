export async function Query(id: string) {
    const { prisma } = $$ctx(this);

    const res = await prisma.root.organization.delete({
        where: { id },
    });

    return res;
}

export const __typename = "Organization";
