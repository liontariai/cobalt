import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig((config) => ({
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
    resolve:
        config.command === "build"
            ? {
                  alias: {
                      "react-dom/server": "react-dom/server.node",
                  },
              }
            : undefined,
    build: {
        target: "es2022",
    },
}));
