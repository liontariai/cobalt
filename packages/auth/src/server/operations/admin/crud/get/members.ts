export async function Query(orgid: string) {
    const { prisma } = $$ctx(this);

    const res = await prisma.root.organizationMembership.findMany({
        where: { org: { id: orgid } },
    });

    return res;
}

export const __typename = "OrganizationMembership";
