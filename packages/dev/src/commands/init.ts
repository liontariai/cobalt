import { Command } from "commander";
import { createDirectory, writeFile } from "./shared";
import { generateBaseFiles } from "../templates/shared";
import path from "path";
import {
    loadTemplates,
    type TemplateConfig,
    type ProjectConfig,
} from "../templates";

type InitOptions = {
    name: string;
    dir: string;
    template?: string;
};

// Configuration functions
const createProjectConfig = (options: InitOptions): ProjectConfig => {
    const projectDir = path.resolve(options.dir, options.name);
    return {
        name: options.name,
        dir: options.dir,
        srcBaseDir: "src",
        projectDir,
        template: options.template,
    };
};

const validateTemplate = async (
    template?: string,
): Promise<string | undefined> => {
    if (!template) return undefined;

    const templates = await loadTemplates();
    if (!templates[template]) {
        const availableTemplates = Object.keys(templates).join(", ");
        throw new Error(
            `Invalid template "${template}". Available templates: ${availableTemplates}`,
        );
    }

    return template;
};

const createDirectoryStructure = async (config: ProjectConfig) => {
    if (!config.template) {
        return;
    }

    const templates = await loadTemplates();
    const templateConfig = templates[config.template];

    templateConfig.directories.forEach((dir: string) => {
        createDirectory(path.join(config.projectDir, dir));
    });
};

// File content generators
const generatePackageJson = (projectName: string) => ({
    name: projectName,
    version: "0.1.0",
    type: "module",
    scripts: {
        dev: "cobalt dev",
        build: "cobalt build",
    },
    dependencies: {
        "@cobalt27/runtime": "latest",
        "@cobalt27/auth": "latest",
        graphql: "^16.8.1",
        "graphql-sse": "^2.5.4",
        "@graphql-tools/schema": "^10.0.0",
    },
    devDependencies: {
        "bun-types": "latest",
        "@cobalt27/dev": "latest",
        typescript: "~5.7.3",
        prettier: "^3.0.0",
        "@types/node": "^20.0.0",
    },
});

const generateTsConfig = () => ({
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
        noEmit: true,
        strict: true,
        noImplicitThis: false,
        allowImportingTsExtensions: true,
        allowSyntheticDefaultImports: true,
        incremental: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules"],
});

const generateReadme = (config: ProjectConfig) => `# ${config.name}

A Cobalt application.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   bun install
   \`\`\`

2. Start the development server:
   \`\`\`bash
   bun dev
   \`\`\`

3. Build for production:
   \`\`\`bash
   bun run build
   \`\`\`

## Project Structure

- \`${config.srcBaseDir}/server/operations/\` - GraphQL operations
- \`${config.srcBaseDir}/server/ctx.ts\` - Context factory

## Available Commands

- \`cobalt dev\` - Start development server
- \`cobalt build\` - Build for production
- \`cobalt start\` - Start the production server
- \`cobalt init\` - Initialize a new project
`;

const generateGitignore = (
    config: ProjectConfig,
    templateConfig?: TemplateConfig,
) => `
.DS_Store
node_modules/
.cobalt/
dist/
.env
*.log
${templateConfig?.gitignore || ""}
`;

// File creation functions
const createProjectFiles = async (config: ProjectConfig) => {
    const { projectDir, template } = config;

    let templateConfig: TemplateConfig | undefined;
    if (template) {
        // Use template-specific file generation
        const templates = await loadTemplates();
        templateConfig = templates[template];

        generateBaseFiles(config).forEach(({ path: filePath, generator }) => {
            writeFile(path.join(projectDir, filePath), generator());
        });

        templateConfig.files.forEach(
            ({
                path: filePath,
                generator,
            }: {
                path: string;
                generator: (config: ProjectConfig) => string;
            }) => {
                writeFile(path.join(projectDir, filePath), generator(config));
            },
        );
    } else {
        // Use default file generation
        writeFile(
            path.join(projectDir, "package.json"),
            JSON.stringify(generatePackageJson(config.name), null, 4),
        );

        writeFile(
            path.join(projectDir, "tsconfig.json"),
            JSON.stringify(generateTsConfig(), null, 4),
        );

        generateBaseFiles(config).forEach(({ path: filePath, generator }) => {
            writeFile(path.join(projectDir, filePath), generator());
        });

        writeFile(path.join(projectDir, "README.md"), generateReadme(config));
    }

    writeFile(
        path.join(projectDir, ".gitignore"),
        generateGitignore(config, templateConfig),
    );
};

// Success message
const displaySuccessMessage = async (config: ProjectConfig) => {
    let templateInfo = "";
    if (config.template) {
        const templates = await loadTemplates();
        templateInfo = ` with ${templates[config.template].name} template`;
    }

    console.log(`
✅ Project initialized successfully${templateInfo}!

Next steps:
1. cd ${config.name}
2. bun install
3. bun dev

Your GraphQL server will be available at http://localhost:4000/graphql
${
    config.template === "react-router-v7"
        ? `
Your React app will be available at http://localhost:4000`
        : ""
}
`);
};

// Main initialization function
const initializeProject = async (config: ProjectConfig) => {
    let templateConfig: TemplateConfig | undefined;
    if (config.template) {
        const templates = await loadTemplates();
        templateConfig = templates[config.template];
        if (templateConfig.srcBaseDir !== config.srcBaseDir) {
            config.srcBaseDir = templateConfig.srcBaseDir;
        }
    }

    console.log(
        `🚀 Initializing Cobalt project: ${config.name}${
            templateConfig ? ` (${templateConfig.name})` : ""
        }`,
    );

    // Create project directory
    createDirectory(config.projectDir);

    // Create directory structure
    await createDirectoryStructure(config);

    // Create all project files
    await createProjectFiles(config);

    // Display success message
    await displaySuccessMessage(config);
};

export const initCommand = (program: Command) => {
    const initCmd = program
        .command("init")
        .description("Initialize a new Cobalt project")
        .option("--name <name>", "Project name", "my-cobalt-app")
        .option("--dir <dir>", "Directory to create the project in", ".")
        .option("--template <template>", "Template to use (optional)")
        .action(async (options) => {
            try {
                const validatedTemplate = await validateTemplate(
                    options.template,
                );
                const config = createProjectConfig({
                    ...options,
                    template: validatedTemplate,
                });
                await initializeProject(config);
            } catch (error) {
                console.error(
                    `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
                );
                process.exit(1);
            }
        });

    return initCmd;
};
