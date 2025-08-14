/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import fs from "fs";
import path from "path";
import { $ } from "bun";
import { Command } from "commander";
import {
    findAuthFile,
    findOperationsDir,
    readManifestFromBundledServer,
} from "../shared";
import { resolve } from "../shared";

export const registerAuthStudioCommand = (auth: Command) => {
    const studioCmd = auth
        .command("studio")
        .description("Open the Cobalt Auth Studio")
        .option("--dir <dir>", "Directory to search for operation endpoints")
        .action(async (options) => {
            const t1 = performance.now();

            let operationsDir: string | undefined;

            // check if bundled dist/cobalt.server.js exists
            const serverPath =
                resolve(path.join(process.cwd(), "dist/cobalt.server.js")) ||
                resolve(path.join(process.cwd(), "cobalt.server.js"));

            if (serverPath) {
                try {
                    // read the manifest from the cobalt.server.js file
                    const manifestJson =
                        await readManifestFromBundledServer(serverPath);

                    operationsDir = manifestJson.cobalt.build.operationsDir;

                    if (!manifestJson.cobalt.cobaltAuth) {
                        console.log(
                            `🚨 Cobalt Auth not found in the bundled server.`,
                        );
                        process.exit(1);
                    }

                    if (!findAuthFile(operationsDir)) {
                        const output = await $`bun run ${serverPath}`
                            .env({
                                OPENAUTH_ISSUER: "placeholder",
                                ...process.env,
                                COBALT_AUTH_EXECUTE_STUDIO: "true",
                            })
                            .quiet();
                        console.log(output.stdout.toString());
                        process.exit(0);
                    }
                } catch (error) {
                    console.log(error);
                    process.exit(1);
                }
            }

            operationsDir =
                operationsDir ||
                findOperationsDir(options?.dir || "operations");
            if (!operationsDir) {
                console.log(
                    `🚨 Operations directory not found in the project, please provide the cobalt operations directory with --dir <dir>`,
                );
                process.exit(1);
            }

            const authFile = findAuthFile(operationsDir);
            if (!authFile) {
                console.log(`🚨 Cobalt Auth not found in the project`);
                process.exit(1);
            }

            const usesCobaltAuth =
                authFile &&
                Object.keys(
                    require(path.join(process.cwd(), "package.json"))
                        .dependencies,
                ).find((dep) => dep === "@cobalt27/auth") !== undefined;

            if (usesCobaltAuth) {
                const cobaltAuthRootDir = path.dirname(
                    Bun.resolveSync(".cobalt/auth/compiled", process.cwd()),
                );

                process.env.OPENAUTH_ISSUER ??= "placeholder";
                if (
                    !process.env.COBALT_AUTH_DATABASE_URL &&
                    !fs.existsSync(
                        path.join(
                            cobaltAuthRootDir,
                            "server",
                            "db",
                            "pglite_data",
                        ),
                    )
                ) {
                    console.log(
                        "🚨 COBALT_AUTH_DATABASE_URL is not set and no pglite_data directory found.\nPlease set COBALT_AUTH_DATABASE_URL or initialize the database with `cobalt auth init`",
                    );
                    process.exit(1);
                }

                console.log("🚀 Opening Cobalt Auth Studio...");

                const { zenstackPrismaSchema, prismaConfigTs } = require(
                    Bun.resolveSync(".cobalt/auth/compiled", process.cwd()),
                ) as {
                    zenstackPrismaSchema: string;
                    prismaConfigTs: string;
                };

                fs.mkdirSync(path.join(process.cwd(), ".cobalt/auth"), {
                    recursive: true,
                });
                fs.writeFileSync(
                    path.join(process.cwd(), ".cobalt/auth/schema.prisma"),
                    zenstackPrismaSchema,
                );

                fs.writeFileSync(
                    path.join(process.cwd(), ".cobalt/auth/prisma.config.ts"),
                    prismaConfigTs,
                );

                fs.mkdirSync(process.env.COBALT_AUTH_DATABASE_URL!, {
                    recursive: true,
                });
                await Bun.$`bun --bun /app/node_modules/.bin/prisma studio`
                    .cwd(path.join(process.cwd(), ".cobalt/auth"))
                    .env({
                        ...process.env,
                        COBALT_AUTH_PRISMA_SCHEMA_PATH: path.join(
                            process.cwd(),
                            ".cobalt/auth/schema.prisma",
                        ),
                    });

                fs.unlinkSync(
                    path.join(process.cwd(), ".cobalt/auth/schema.prisma"),
                );
                fs.unlinkSync(
                    path.join(process.cwd(), ".cobalt/auth/prisma.config.ts"),
                );
                fs.rmdirSync(path.join(process.cwd(), ".cobalt/auth"));
                fs.rmdirSync(path.join(process.cwd(), ".cobalt"));
            } else {
                console.log(`🚨 Cobalt Auth not found in the project`);
            }
            console.log(
                `🚀 Bootstrapped Cobalt Auth in ${(
                    performance.now() - t1
                ).toFixed(2)} ms`,
            );
            process.exit(0);
        });

    return studioCmd;
};
