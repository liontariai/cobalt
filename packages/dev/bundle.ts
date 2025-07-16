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
    banner: "#!/usr/bin/env bun",
    target: "node",
});
