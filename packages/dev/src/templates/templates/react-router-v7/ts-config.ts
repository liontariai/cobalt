import type {
    JsxEmit,
    ModuleKind,
    ModuleResolutionKind,
    ScriptTarget,
} from "typescript";
import type { ProjectConfig } from "../..";
import { adjustTsConfigForCobalt } from "../../shared";

// React Router v7 specific TypeScript config
export const generateTsConfig = (config: ProjectConfig) => {
    return adjustTsConfigForCobalt(config, {
        include: [
            "**/*",
            "**/.server/**/*",
            "**/.client/**/*",
            ".react-router/types/**/*",
        ],
        compilerOptions: {
            lib: ["DOM", "DOM.Iterable", "ES2022"],
            types: ["node", "vite/client"],
            target: "ES2022" as unknown as ScriptTarget,
            module: "ES2022" as unknown as ModuleKind,
            moduleResolution: "bundler" as unknown as ModuleResolutionKind,
            jsx: "react-jsx" as unknown as JsxEmit,
            rootDirs: [".", "./.react-router/types"],
            baseUrl: ".",
            paths: {
                "~/*": ["./app/*"],
            },
            esModuleInterop: true,
            verbatimModuleSyntax: true,
            noEmit: true,
            resolveJsonModule: true,
            skipLibCheck: true,
            strict: true,
        },
    });
};
