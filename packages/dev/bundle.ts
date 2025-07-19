import { build } from "bun";

// esm output
await build({
    entrypoints: ["./src/index.ts"],
    external: Object.keys(require("./package.json").dependencies).concat([
        "graphql",
        "graphql-sse",
        "@graphql-tools/schema",
    ]),
    outdir: "./dist/esm",
    format: "esm",
    target: "bun",
    sourcemap: "inline",
}).then((output) => {
    // write "#!/usr/bin/env bun" to the top of the file
    const fs = require("fs");
    const path = require("path");
    const file = path.join(output.outputs[0].path);
    const content = fs.readFileSync(file, "utf8");
    fs.writeFileSync(file, "#!/usr/bin/env bun\n" + content);
    console.log("Bundled successfully");
});
