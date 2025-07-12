import { Command } from "commander";
import { createDirectory, writeFile } from "./shared";
import path from "path";

export const initCommand = (program: Command) => {
    const initCmd = program
        .command("init")
        .description("Initialize a new Cobalt project")
        .option("--name <name>", "Project name", "my-cobalt-app")
        .option("--dir <dir>", "Directory to create the project in", ".")
        .action(async (options) => {
            const projectName = options.name;
            const projectDir = path.resolve(options.dir, projectName);

            console.log(`🚀 Initializing Cobalt project: ${projectName}`);

            // Create project directory
            createDirectory(projectDir);

            // Create basic directory structure
            createDirectory(path.join(projectDir, "src"));
            createDirectory(path.join(projectDir, "src/server"));
            createDirectory(path.join(projectDir, "src/server/operations"));
            createDirectory(path.join(projectDir, "src/server/types"));

            // Create package.json
            const packageJson = {
                name: projectName,
                version: "0.1.0",
                type: "module",
                scripts: {
                    dev: "cobalt dev",
                    build: "cobalt build",
                },
                dependencies: {
                    "@cobalt27/runtime": "workspace:*",
                    // "@cobalt27/auth": "latest",
                    graphql: "^16.8.1",
                    "graphql-sse": "^2.5.4",
                    "@graphql-tools/schema": "^10.0.0",
                },
                devDependencies: {
                    "bun-types": "latest",
                    "@cobalt27/dev": "workspace:*",
                    typescript: "~5.7.3",
                    prettier: "^3.0.0",
                    "@types/node": "^20.0.0",
                },
            };

            writeFile(
                path.join(projectDir, "package.json"),
                JSON.stringify(packageJson, null, 2),
            );

            // Create tsconfig.json
            const tsconfigJson = {
                compilerOptions: {
                    lib: ["ES2022"],
                    types: ["@cobalt27/runtime", "node"],
                    isolatedModules: true,
                    esModuleInterop: true,
                    jsx: "react-jsx",
                    module: "ES2022",
                    moduleResolution: "Bundler",
                    resolveJsonModule: true,
                    target: "ES2022",
                    allowJs: true,
                    skipLibCheck: true,
                    forceConsistentCasingInFileNames: true,
                    baseUrl: ".",
                    paths: {
                        sdk: ["./.cobalt/sdk.ts"],
                        $$types: ["./.cobalt/$$types"],
                        $$ctx: ["./src/server/ctx.ts"],
                    },

                    // Vite takes care of building everything, not tsc.
                    noEmit: true,

                    // needed for correctly detecting null | undefined in types
                    strict: true,
                    // we are using 'this' for cobalt runtime helper functions and dont want to define it, so let's mute the ts error
                    noImplicitThis: false,

                    allowImportingTsExtensions: true,
                    allowSyntheticDefaultImports: true,
                    incremental: true,
                },
                include: ["src/**/*"],
                exclude: ["node_modules"],
            };

            writeFile(
                path.join(projectDir, "tsconfig.json"),
                JSON.stringify(tsconfigJson, null, 2),
            );

            // Create basic ctx.ts
            const ctxContent = `export default async function ({ headers }: CobaltCtxInput) {
    const userid: string = headers.get("Authorization") ?? "anonymous";

    return {
        userid,
        // Add your context here
        // Example: database connection, user session, etc.
    };
}
`;
            writeFile(path.join(projectDir, "src/server/ctx.ts"), ctxContent);

            //             // Create basic auth.ts
            //             const authContent = `import type { CobaltAuthConfig } from "@cobalt27/auth";

            // const authConfig: CobaltAuthConfig = {
            //     issuer: {
            //         cobalt: {
            //             authserver: undefined, // Configure your auth server here
            //             oauth: undefined, // Configure OAuth providers here
            //         },
            //     },
            // };

            // export default authConfig;
            // `;

            //             writeFile(path.join(projectDir, "src/auth.ts"), authContent);

            // Create example operation
            const exampleOperation = `export function Query() {
    // Use $$ctx(this) helper function to get the GraphQL context value
    // this is fully typed and \`$$ctx\` is available in the global scope

    const { userid } = $$ctx(this);

    return {
        user: userid,
        name: "Peter",
        image: "...",
    };
}

// By exporting this you can customize the name of your return type
// for the GraphQL schema and also extend the UserProfile type via the
// types/UserProfile.ts file
export const __typename = "UserProfile";
`;

            writeFile(
                path.join(projectDir, "src/server/operations/profile.ts"),
                exampleOperation,
            );

            // Extend the UserProfile type
            const userProfileType = `export async function bio() {
    // The $$root.TYPENAME(this) is a helper that returns the graphql \`root\` object
    // It serves as a typing helper but you have to choose the correct type name
    // yourself.
    //
    // You get autocompletion for the type names, but you have to
    // choose the correct one, which is defined by the file name of the current
    // file. In this case, the type name is \`UserProfile\` because the file is
    // called \`UserProfile.ts\`.
    const { name } = $$root.UserProfile(this);

    return \`\${name} became a Samarium & Cobalt fan on first sight! He will never forget the \${new Date().toLocaleDateString()}, because it changed his life forever!\`;
}
`;
            writeFile(
                path.join(projectDir, "src/server/types/UserProfile.ts"),
                userProfileType,
            );

            // Create README.md
            const readmeContent = `# ${projectName}

A Cobalt application.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   bun install
   \`\`\`

2. Start the development server:
   \`\`\`bash
   bun run dev
   \`\`\`

3. Build for production:
   \`\`\`bash
   bun run build
   \`\`\`

## Project Structure

- \`src/server/operations/\` - GraphQL operations
- \`src/server/ctx.ts\` - Context factory

## Available Commands

- \`cobalt start\` - Start development server
- \`cobalt build\` - Build for production
- \`cobalt init\` - Initialize a new project
`;

            writeFile(path.join(projectDir, "README.md"), readmeContent);

            // Create .gitignore
            const gitignoreContent = `node_modules/
.cobalt/
dist/
.env
*.log
`;

            writeFile(path.join(projectDir, ".gitignore"), gitignoreContent);

            console.log(`
✅ Project initialized successfully!

Next steps:
1. cd ${projectName}
2. bun install
3. bun run dev

Your GraphQL server will be available at http://localhost:4000/graphql
`);
        });

    return initCmd;
};
