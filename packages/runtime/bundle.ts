import { build } from "bun";

// esm output
await build({
    entrypoints: ["./src/index.ts"],
    outdir: "./dist/esm",
    format: "esm",
    target: "bun",
});
