/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import { Command } from "commander";
import { resolve } from "./shared";
import path from "path";
import { spawnSync } from "child_process";

export const startCommand = (program: Command) => {
    const startCmd = program
        .command("start")
        .description("Start the server")
        .option("-p, --port <port>", "Port to run the server on", "4000")
        .action(async (options) => {
            const { port } = options;

            // check if dist/server.js exists
            const serverPath = resolve(
                path.join(process.cwd(), "dist/server.js"),
            );
            if (!serverPath) {
                console.error(
                    "Server not found. Please build the server first.",
                );
                process.exit(1);
            }

            // Check if Bun is installed
            let runner = "node";
            try {
                const bunCheck = spawnSync("bun", ["--version"], {
                    stdio: "ignore",
                });
                if (bunCheck.status === 0) {
                    runner = "bun";
                }
            } catch (e) {
                // bun not installed, fallback to node
            }

            // start the server
            spawnSync(runner, [serverPath, "--port", port], {
                stdio: "inherit",
                cwd: path.dirname(serverPath),
            });
        });

    return startCmd;
};
