export async function Query(userid: string) {
    const { prisma } = $$ctx(this);

    const res = await prisma.root.organizationMembership.findMany({
        where: { user: { id: userid } },
    });

    return res;
}

export const __typename = "OrganizationMembership";
