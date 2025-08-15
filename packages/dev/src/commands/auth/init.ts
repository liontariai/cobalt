/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import { Command } from "commander";
import {
    findAuthFile,
    findOperationsDir,
    readManifestFromBundledServer,
} from "../shared";
import path from "path";

import { resolve } from "../shared";
import { $ } from "bun";

type CobaltAuthConfig = import("@cobalt27/auth").CobaltAuthConfig;

export const registerAuthInitCommand = (auth: Command) => {
    const initCmd = auth
        .command("init")
        .description("Initialize Cobalt Auth in the current project")
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
                        // if we can't find the auth config file, it means we have the bundled
                        // project with the docker setup. The auth config is compiled into the cobalt.server.js file. And we
                        // have the information to bootstrap the auth db in the manifest.
                        // console.log(
                        //     "🚀 Executing cobalt auth init via bundled server...",
                        // );
                        const output = await $`bun run ${serverPath}`
                            .env({
                                ...process.env,
                                OPENAUTH_ISSUER: "placeholder",
                                COBALT_AUTH_EXECUTE_INIT: "true",
                            })
                            .quiet();
                        console.log(output.stdout.toString());
                        // console.log("🚀 Cobalt auth init completed");
                        process.exit(0);
                    }
                } catch (error) {
                    console.log(error);
                    process.exit(1);
                }
            }

            console.log(`🚀 Initializing Cobalt Auth...`);
            process.env.OPENAUTH_ISSUER ??= "placeholder";

            operationsDir =
                operationsDir || findOperationsDir(options.dir || "operations");
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
                // build and bootstrap cobalt-auth
                process.env.COBALT_AUTH_DEV = "true";
                process.env.COBALT_AUTH_CONFIG_FILEPATH = authFile;

                if (require.cache[authFile]) {
                    delete require.cache[authFile];
                }
                const authConfig = (
                    require(Bun.resolveSync(authFile, process.cwd())) as {
                        default: CobaltAuthConfig;
                    }
                ).default;
                const {
                    issuer: { cobalt },
                } = authConfig;
                // bootstrap cobalt-auth
                await Promise.resolve(cobalt);

                delete process.env.COBALT_AUTH_DEV;
                delete process.env.COBALT_AUTH_CONFIG_FILEPATH;
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

    return initCmd;
};
