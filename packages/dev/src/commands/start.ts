/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import { Command } from "commander";
import { resolve } from "./shared";
import path from "path";
import { $ } from "bun";

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

            // start the server
            $`bun run ${serverPath} --port ${port}`;
        });

    return startCmd;
};
