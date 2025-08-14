import { readdir } from "fs/promises";
import path from "path";

export type ProjectConfig = {
    name: string;
    dir: string;
    srcBaseDir: string;
    projectDir: string;
    template?: string;
};

export type TemplateConfig = {
    name: string;
    description: string;
    srcBaseDir: string;
    directories: string[];
    files: Array<{
        path: string;
        generator: (config: ProjectConfig) => string;
    }>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    gitignore?: string;
};

let templatesCache: Record<string, TemplateConfig> | null = null;

export const loadTemplates = async (): Promise<
    Record<string, TemplateConfig>
> => {
    if (templatesCache) {
        return templatesCache;
    }

    const templatesDir = path.join(__dirname, "templates");
    const templateFiles = await readdir(templatesDir);

    const templates: Record<string, TemplateConfig> = {};

    for (const file of templateFiles) {
        if (file.endsWith(".ts") && file !== "index.ts") {
            const templateName = file.replace(".ts", "");
            const templateModule = await import(`./templates/${templateName}`);
            templates[templateName] = templateModule.default;
        } else if (!file.includes(".")) {
            const templateName = file;
            const templateModule = await import(
                `./templates/${templateName}/index.ts`
            );
            templates[templateName] = templateModule.default;
        }
    }

    templatesCache = templates;
    return templates;
};
