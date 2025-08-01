/// <reference types="@cobalt27/runtime/types/runtime.d.ts" />

import { Command } from "commander";
import { devCommand } from "./commands/dev";
import { initCommand } from "./commands/init";
import { buildCommand } from "./commands/build";
import { startCommand } from "./commands/start";

const program = new Command();
program.name("Cobalt");
program.version(require("../package.json").version);
program.description("Cobalt development server and build tools");

// Register commands
startCommand(program);
devCommand(program);
initCommand(program);
buildCommand(program);

// Set start command as default when no command is provided
if (process.argv.length === 2) {
    process.argv.push("dev");
}

program.parse(process.argv);
