import { PrismaClient } from "@prisma/client";

export default async function ctx({ headers }: { headers: Headers }) {
    const prisma = new PrismaClient();

    return {
        headers,
        prisma,
    };
}
