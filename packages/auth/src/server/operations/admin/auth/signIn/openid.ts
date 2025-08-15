import type { OpenIdClaims } from "@/db/zenstack/models";

export async function connectOpenId(
    user_arn: string,
    provider: keyof OpenIdClaims,
    claims: OpenIdClaims[keyof OpenIdClaims],
    ctx: ReturnType<typeof $$ctx>,
) {
    const { prisma } = ctx;

    if (!claims || !claims.sub) {
        throw new Error("No claims provided, or no 'sub' in claims");
    }

    const existingUser = await prisma.root.user.findFirst({
        where: {
            user_arn,
        },
        include: {
            open_id_accounts: {
                where: {
                    provider,
                    claims: {
                        // this is a ugly hack-around, because for some reason the type of path changed to string
                        // when using the latest zenstack and prisma 6.13.0
                        // This might come from the workaround we're using for zenstack because the schema is
                        // is defined with sqlite as database but we change it after prisma schema generation
                        // to postgres.
                        // in any case, for the typing to work we need to type cast it to string but in reality
                        // an array of strings is expected
                        path: [provider, "sub"] as unknown as string,
                        equals: claims.sub,
                    },
                },
            },
        },
    });

    if (existingUser && existingUser.open_id_accounts.length > 0) {
        return existingUser;
    } else if (existingUser) {
        const updatedUser = await prisma.root.user.update({
            where: {
                id: existingUser.id,
            },
            data: {
                open_id_accounts: {
                    create: {
                        identity: { connect: { id: existingUser.id } },

                        provider,
                        claims: { [provider]: claims },

                        // expiresAt: new Date(claims.exp),

                        access_tokens: [],
                    },
                },
            },
        });

        return updatedUser;
    }

    const providerUsesEmail = "email" in claims;
    const associateEmails = providerUsesEmail
        ? [
              {
                  email: claims.email!,
                  verified: true,
                  primary: true,
              },
          ]
        : [];

    const [newUser, newOpenIdConnection] = await prisma.root.$transaction(
        async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    user_arn,
                    emails: associateEmails,
                },
            });
            const newOpenIdConnection = await tx.openIdUserAccount.create({
                data: {
                    identity: { connect: { id: newUser.id } },
                    user: { connect: { id: newUser.id } },

                    provider,
                    claims: {
                        [provider]: claims,
                    },

                    // expiresAt: new Date(claims.exp),

                    access_tokens: [],
                },
            });

            return [newUser, newOpenIdConnection];
        },
    );

    return newUser;
}
