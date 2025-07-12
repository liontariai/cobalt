export async function Mutation(email: string) {
    const { prisma } = $$ctx(this);

    return { success: true };
}

export const __typename = "Success";
