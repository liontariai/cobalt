import { build } from "bun";

// esm output
await build({
    entrypoints: ["./src/index.ts"],
    external: Object.keys(require("./package.json").dependencies),
    outdir: "./dist/esm",
    format: "esm",
    target: "bun",
});
