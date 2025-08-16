import reactRouterV7 from "./templates/react-router-v7";

const templatesMap = {
    "react-router-v7": reactRouterV7,
};

export type ProjectConfig = {
    name: string;
    dir: string;
    srcBaseDir: string;
    projectDir: string;
    template?: string;
};

export type ProjectConfigInitialized = Omit<ProjectConfig, "template"> & {
    template: TemplateConfig | undefined;
};

export type TemplateConfig = {
    name: string;
    shortName: string;
    description: string;
    srcBaseDir: string;
    directories: string[];
    files: Array<{
        path: string;
        generator: (config: ProjectConfigInitialized) => string;
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
    const templates: Record<string, TemplateConfig> = {};

    for (const [templateName, templateModule] of Object.entries(templatesMap)) {
        templates[templateName] = templateModule;
    }

    templatesCache = templates;
    return templates;
};
