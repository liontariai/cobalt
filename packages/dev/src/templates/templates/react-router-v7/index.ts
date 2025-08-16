import type {
    ProjectConfig,
    ProjectConfigInitialized,
    TemplateConfig,
} from "../../index";
import {
    generateBasePackageJson,
    generateBaseReadme,
    generateGitignore,
} from "../../shared";
import { generateTsConfig } from "./ts-config";
import { SCRIPTS, DEPENDENCIES, DEV_DEPENDENCIES } from "./package-json";
import { files } from "./files";

// React Router v7 specific directories
const DIRECTORIES = ["app", "app/routes", "public"];

const template: TemplateConfig = {
    name: "React Router v7",
    shortName: "rr7",
    description:
        "A Cobalt project with React Router v7 for client-side routing",
    directories: DIRECTORIES,
    dependencies: DEPENDENCIES,
    devDependencies: DEV_DEPENDENCIES,
    srcBaseDir: ".",
    gitignore: `
# React Router
/.react-router/
/build/
`,
    files: [
        {
            path: "package.json",
            generator: (config: ProjectConfigInitialized) =>
                JSON.stringify(
                    generateBasePackageJson(
                        config,
                        SCRIPTS,
                        DEPENDENCIES,
                        DEV_DEPENDENCIES,
                    ),
                    null,
                    4,
                ),
        },
        {
            path: "tsconfig.json",
            generator: (config: ProjectConfigInitialized) =>
                JSON.stringify(generateTsConfig(config), null, 4),
        },
        ...Object.entries(files).map(([path, generator]) => ({
            path,
            generator: (config: ProjectConfigInitialized) => generator(config),
        })),
        {
            path: "README.md",
            generator: (config: ProjectConfigInitialized) =>
                generateBaseReadme(
                    config,
                    "React Router v7",
                    "A Cobalt project with React Router v7 for client-side routing",
                    `
                    # ${config.name}

                    ## Project Structure

                    - \`app/\` - React client-side code
                    - \`app/routes/\` - Route definitions
                    - \`public/\` - Static assets
                    - \`server/\` - Server-side code
                    - \`server/ctx.ts\` - Context for server-side operations
                    - \`server/operations/\` - Server-side operations
                    - \`server/types/\` - Server-side types
                    `,
                ),
        },
        {
            path: ".gitignore",
            generator: () => generateGitignore(),
        },
    ],
};

export default template;
