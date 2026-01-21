import type { CompilerOptions } from "typescript";
import type { ProjectConfigInitialized } from "./index";
import path from "path";

// Shared Cobalt dependencies
export const COBALT_DEPENDENCIES = {
    "@cobalt27/dev": "latest",
    "@cobalt27/runtime": "latest",
    graphql: "^16.8.1",
    "graphql-sse": "^2.5.4",
    "@graphql-tools/schema": "^10.0.0",
} as const;

export const COBALT_DEV_DEPENDENCIES = {
    "bun-types": "latest",
    typescript: "~5.7.3",
    prettier: "^3.0.0",
    "@types/node": "^20.0.0",
    concurrently: "^9.2.0",
} as const;

// Shared base TypeScript config
export const generateBaseTsConfig = (config: ProjectConfigInitialized) => ({
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
            $$ctx: [`${config.srcBaseDir}/server/ctx.ts`],
        },
        noEmit: true,
        strict: true,
        noImplicitThis: false,
        allowImportingTsExtensions: true,
        allowSyntheticDefaultImports: true,
        incremental: true,
    },
    include: [`${config.srcBaseDir}/**/*`],
});
export const adjustTsConfigForCobalt = (
    config: ProjectConfigInitialized,
    tsConfig: Record<string, any> & {
        include?: string[];
        exclude?: string[];
        compilerOptions: CompilerOptions;
    },
) => {
    const baseConfig = generateBaseTsConfig(config);

    const baseUrl = tsConfig.compilerOptions?.baseUrl || ".";
    const rootFromBaseUrl = path.relative(baseUrl, ".") || ".";

    return {
        ...tsConfig,
        include: Array.from(
            new Set([...(tsConfig.include || []), ...baseConfig.include]),
        ),
        exclude: tsConfig.exclude || [],
        // exclude: Array.from(
        //     new Set([...(tsConfig.exclude || []), ...baseConfig.exclude]),
        // ),
        compilerOptions: {
            ...tsConfig.compilerOptions,
            types: Array.from(
                new Set([
                    ...baseConfig.compilerOptions.types,
                    ...(tsConfig.compilerOptions.types || []),
                ]),
            ),
            baseUrl,
            paths: {
                sdk: [`${rootFromBaseUrl}/.cobalt/sdk.ts`],
                $$types: [`${rootFromBaseUrl}/.cobalt/$$types`],
                $$ctx: [
                    `${rootFromBaseUrl}/${config.srcBaseDir}/server/ctx.ts`,
                ],
            },
            strict: true,
            noImplicitThis: false,
        },
    };
};

// Shared package.json generator
export const generateBasePackageJson = (
    config: ProjectConfigInitialized,
    additionalScripts: Record<string, string> = {},
    additionalDeps: Record<string, string> = {},
    additionalDevDeps: Record<string, string> = {},
) => ({
    name: config.name,
    version: "0.1.0",
    type: "module",
    scripts: {
        ...Object.fromEntries(
            Object.entries(additionalScripts)
                .map(([key, value]) => [
                    ["dev", "build", "start"].includes(key)
                        ? [
                            [`${config.template?.shortName}:${key}`, value],
                            [
                                key,
                                `concurrently ${["dev", "start"].includes(key) ? "--restartTries 10 --restartDelay 2000" : ""} "cobalt ${key}" "bun run ${config.template?.shortName}:${key}"`,
                            ],
                        ]
                        : [[key, value]],
                ])
                .flat(2),
        ),
        ...Object.fromEntries(
            Object.entries({
                dev: "cobalt dev",
                build: "cobalt build",
                start: "cobalt start",
            }).map(([key, value]) => [
                key in additionalScripts ? `cobalt:${key}` : key,
                value,
            ]),
        ),
    },
    dependencies: {
        ...(config.withAuth
            ? { "@cobalt27/auth": "latest", valibot: "1.1.0" }
            : {}),
        ...Object.fromEntries(
            Object.entries({
                ...COBALT_DEPENDENCIES,
                ...additionalDeps,
            }).sort(([a], [b]) => a.localeCompare(b)),
        ),
    },
    devDependencies: Object.fromEntries(
        Object.entries({
            ...COBALT_DEV_DEPENDENCIES,
            ...additionalDevDeps,
        }).sort(([a], [b]) => a.localeCompare(b)),
    ),
});

// Shared Cobalt context
export const generateCtxContent = (
    config: ProjectConfigInitialized,
) => `export default async function ({ headers }: CobaltCtxInput) {
    ${config.withAuth ? "" : `const userid: string = headers.get("Authorization") ?? "anonymous"`}
    return {
        ${config.withAuth ? "" : `userid,`}
        // Add your context here
        // Example: database connection, user session, etc.
    };
}
`;

// Shared example GraphQL operation
export const generateExampleOperation = (
    config: ProjectConfigInitialized,
) => `export function Query() {
    // Use $$ctx(this) helper function to get the GraphQL context value
    // this is fully typed and \`$$ctx\` is available in the global scope

    ${config.withAuth ? `const { token } = $$auth(this);` : `const { userid } = $$ctx(this);`}

    return {
        user: ${config.withAuth ? `token.subject.properties.id` : `userid`},
        name: "Peter",
    };
}

// By exporting this you can customize the name of your return type
// for the GraphQL schema and also extend the UserProfile type via the
// types/UserProfile.ts file
export const __typename = "UserProfile";
`;

// Shared UserProfile type extension
export const generateUserProfileType = (
    config: ProjectConfigInitialized,
) => `export async function bio() {
    // The $$root.TYPENAME(this) is a helper that returns the graphql \`root\` object
    // It serves as a typing helper but you have to choose the correct type name
    // yourself.
    //
    // You get autocompletion for the type names, but you have to
    // choose the correct one, which is defined by the file name of the current
    // file. In this case, the type name is \`UserProfile\` because the file is
    // called \`UserProfile.ts\`.
    const { name } = $$root.UserProfile(this);

    return \`\${name} became a Samarium & Cobalt fan on first sight! \nHe will never forget the \${new Date().toLocaleDateString()}, because it changed his life forever!\`;
}

export function image() {
    const { name } = $$root.UserProfile(this);
    return \`https://ui-avatars.com/api/?name=\${name}\`;
}

export function email() {
    const { user } = $$root.UserProfile(this);
    return \`\${user}@example.com\`;
}
`;

// Shared .gitignore
export const generateGitignore = () => `node_modules/
.cobalt/
dist/
.env
*.log
`;

export const generateAuthContent = (
    config: ProjectConfigInitialized,
) => `import auth from "@cobalt27/auth";

import { string } from "valibot";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";

import { CodeProvider } from "@openauthjs/openauth/provider/code";
import { CodeUI } from "@openauthjs/openauth/ui/code";

export default {
    clientId: "client_id",
    issuer: {
        cobalt: auth({
            models: {
                user: {
                    id: "String @id @default(ulid())",
                },
            },
            tokens: {
                user: {
                    id: string(),
                },
            },
            providers: {
                code: CodeProvider<{ email: string }>(
                    CodeUI({
                        mode: "email",
                        sendCode: async (email, code) => {
                            console.log(email, code);
                        },
                    }),
                ),
            },
            openauth: (sdk) => ({
                storage: MemoryStorage({
                    persist: "./persist.json",
                }),
                success: async (ctx, value) => {
                    if (value.provider === "code") {
                        const email = value.claims.email;

                        const user = await sdk.mutation.adminAuthSignIn({
                            user_id: email,
                            claims: {
                                email,
                            },
                            provider: "email",
                        })(({ id }) => ({ id }));

                        if (!user?.id) {
                            throw new Error("User not found");
                        }

                        return ctx.subject("user", user);
                    }

                    throw new Error("Invalid provider");
                },
                ttl: {
                    access: 60 * 60 * 24 * 30,
                    refresh: 60 * 60 * 24 * 30 * 3,
                },
            }),
        }),
    },
};
`;

// Shared base files that every template should include
export const generateBaseFiles = (config: ProjectConfigInitialized): { path: string; generator: (config?: ProjectConfigInitialized) => string | Buffer; skipWhenTemplate?: boolean }[] => {
    return [
        ...[
            config.withAuth
                ? [
                    {
                        path: `${config.srcBaseDir}/server/auth.ts`,
                        generator: () => generateAuthContent(config),
                    },
                    {
                        path: `.env.local`,
                        generator: () =>
                            `OPENAUTH_ISSUER=http://localhost:4000`,
                    },
                ]
                : [],
        ].flat(),
        {
            path: `${config.srcBaseDir}/index.ts`,
            skipWhenTemplate: true,
            generator: () => `import sdk from "sdk";

const user = await sdk.query.profile();

console.log(user);`,
        },
        {
            path: `${config.srcBaseDir}/server/ctx.ts`,
            generator: () => generateCtxContent(config),
        },
        {
            path: `${config.srcBaseDir}/server/operations/profile.ts`,
            generator: () => generateExampleOperation(config),
        },
        {
            path: `${config.srcBaseDir}/server/types/UserProfile.ts`,
            generator: () => generateUserProfileType(config),
        },
        {
            path: ".gitignore",
            generator: () => generateGitignore(),
        },
    ].filter(Boolean);
};

// Shared README generator
export const generateBaseReadme = (
    config: ProjectConfigInitialized,
    templateName: string,
    templateDescription: string,
    additionalStructure: string = "",
) => `# ${config.name}

A Cobalt application with ${templateName}.

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

4. Start the production server:
   \`\`\`bash
   bun run start
   \`\`\`

## Project Structure

- \`${config.srcBaseDir}/server/operations/\` - GraphQL operations
- \`${config.srcBaseDir}/server/ctx.ts\` - Context factory${additionalStructure ? `\n${additionalStructure}` : ""}

## Available Commands

- \`cobalt dev\` - Start development server
- \`cobalt build\` - Build for production
- \`cobalt start\` - Start the production server
- \`cobalt init\` - Initialize a new project

## Template: ${templateName}

${templateDescription}
`;
