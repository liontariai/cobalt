/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import path from "path";
import { $ } from "bun";
import { Command } from "commander";
import { readManifestFromBundledServer, resolve } from "./shared";

export const startCommand = (program: Command) => {
    const startCmd = program
        .command("start")
        .description("Start the server")
        .option("-p, --port <port>", "Port to run the server on", "4000")
        .action(async (options) => {
            const { port } = options;

            // check if dist/cobalt.server.js exists
            const serverPath =
                resolve(path.join(process.cwd(), "dist/cobalt.server.js")) ||
                resolve(path.join(process.cwd(), "cobalt.server.js"));
            if (!serverPath) {
                console.error(
                    "Server not found. Please build the server first.",
                );
                process.exit(1);
            }

            // read the manifest from the cobalt.server.js file
            const manifestJson =
                await readManifestFromBundledServer(serverPath);

            let cobaltAuthDatabasePath: string | undefined;
            let cobaltAuthDatabaseInitialized: boolean = false;
            if (manifestJson.cobalt.cobaltAuth) {
                console.log(
                    `🔑 Cobalt Auth v${manifestJson.cobalt.cobaltAuth.version} detected.`,
                );
                console.log(`🔑 Checking for Cobalt Auth Database...`);
                const dbPathGivenViaEnv = process.env.COBALT_AUTH_DATABASE_URL;

                if (dbPathGivenViaEnv) {
                    console.log(
                        `🔑 Given via 'COBALT_AUTH_DATABASE_URL' environment variable.\nUsing database at ${dbPathGivenViaEnv}`,
                    );
                    cobaltAuthDatabasePath = dbPathGivenViaEnv;
                    cobaltAuthDatabaseInitialized = true;
                } else {
                    cobaltAuthDatabasePath = path.join(
                        path.dirname(
                            Bun.resolveSync(".cobalt/auth/sdk", process.cwd()),
                        ),
                        "server/db/pglite_data",
                    );
                    console.log(
                        `🔑 No database path given.\nUsing default path: ${cobaltAuthDatabasePath} to initialize or use existing pglite database.`,
                    );
                    $`bunx cobalt auth init --dir ${manifestJson.cobalt.build.operationsDir}`
                        .quiet()
                        .env({
                            ...(process.env as Record<string, string>),
                            OPENAUTH_ISSUER: "placeholder",
                            COBALT_AUTH_DATABASE_URL: cobaltAuthDatabasePath,
                        })
                        .catch((e) => {
                            console.error(
                                "\n\x1b[31m[Error running cobalt auth init]\x1b[0m",
                            );
                            if (e?.stderr) {
                                e.stderr.pipeTo?.(process.stderr.writable);
                            } else if (e instanceof Error) {
                                console.error(e.stack || e.message);
                            } else {
                                console.error(e);
                            }
                            process.exit(1);
                        });
                    cobaltAuthDatabaseInitialized = true;
                }
            }

            // start the server
            Bun.spawnSync({
                cmd: ["bun", "run", serverPath, "--port", port.toString()],
                env: {
                    OPENAUTH_ISSUER: "http://localhost:4000",
                    ...(process.env as Record<string, string>),
                    COBALT_AUTH_DATABASE_URL: cobaltAuthDatabasePath ?? "",
                },
                stdio: ["ignore", "inherit", "inherit"],
            });
        });

    return startCmd;
};
