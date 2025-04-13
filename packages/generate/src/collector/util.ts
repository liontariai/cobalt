import * as ts from "typescript";
import fs from "fs";
import path from "path";
export const FILENAME = "__ts-type-inline__";
export const FILENAME_RE = new RegExp(FILENAME);

/**
 * Set compiler options for checking inline code
 *
 * These options set a global options object which any subsequent
 * invocations of `resolveTypes` will use.
 *
 * ignoreProjectOptions controls if the options from tsconfig are
 * used or not.
 *
 * @param input Compiler options for use when checking inline code.
 * @param ignoreProjectOptions If true, do not merge the passed options with
 *     the project options (from tsconfig.json) but only use the passed options
 *     exclusively. False by default.
 */
export const getOptions = (
    cwd?: string,
): { include?: string[]; compilerOptions: ts.CompilerOptions } => {
    const maybeFile = ts.findConfigFile(cwd ?? __dirname, fs.existsSync);
    if (maybeFile == undefined) {
        throw new Error("setOptions: Cannot find tsconfig.json");
    }
    const { config, error } = ts.readConfigFile(maybeFile, (path) =>
        fs.readFileSync(path).toString(),
    );
    if (error != undefined) {
        const message = `TS${error.code}: ${error.file}:${error.start} ${error.messageText}`;
        throw new Error(message);
    }

    return {
        ...config,
        compilerOptions: {
            ...config.compilerOptions,
            ...(config.compilerOptions.baseUrl
                ? {
                      baseUrl: path.resolve(
                          path.dirname(maybeFile),
                          config.compilerOptions.baseUrl,
                      ),
                  }
                : {}),

            // needed for correctly detecting null | undefined in types
            strict: true,
            // we are using 'this' for cobalt runtime helper functions and dont want to define it, so let's mute the ts error
            noImplicitThis: false,
        },
    };
};

/**
 * Use the inline code to create a TypeScript program
 * To do so, we provide a fake file name and a custom
 * compile host which returns the inline code as source
 * file
 *
 * @param code The inline code we want to turn into a program
 */
export const createInlineProgram = (
    code: string,
    { cwd }: { cwd?: string } = {},
) => {
    // Work around definite assignemt checking: inlineSourceFile is assigned
    // when ts.createProgram is created
    let sourceFile!: ts.SourceFile;
    const getSourceFile = (
        fileName: string,
        languageVersion: ts.ScriptTarget,
        ...args: any[]
    ) => {
        // if (fileName.includes("ctx")) {
        // console.log(fileName);
        // }
        if (!FILENAME_RE.test(fileName)) {
            return (compilerHost.getSourceFile as any)(
                fileName,
                languageVersion,
                ...args,
            );
        }
        if (sourceFile == undefined) {
            sourceFile = ts.createSourceFile(FILENAME, code, languageVersion);
        }
        return sourceFile;
    };
    const options = {}; //getOptions(cwd);
    // const options = {
    //     include: _options.include,

    //     ..._options.compilerOptions,

    //     jsx: _options.compilerOptions.jsx
    //         ? ts.JsxEmit[
    //               _options.compilerOptions
    //                   .jsx as unknown as keyof typeof ts.JsxEmit
    //           ]
    //         : undefined,
    //     module: _options.compilerOptions.module
    //         ? ts.ModuleKind[
    //               _options.compilerOptions
    //                   .module as unknown as keyof typeof ts.ModuleKind
    //           ]
    //         : undefined,
    //     moduleDetection: _options.compilerOptions.moduleDetection
    //         ? ts.ModuleDetectionKind[
    //               _options.compilerOptions
    //                   .moduleDetection as unknown as keyof typeof ts.ModuleDetectionKind
    //           ]
    //         : undefined,
    //     moduleResolution: _options.compilerOptions.moduleResolution
    //         ? ts.ModuleResolutionKind[
    //               _options.compilerOptions
    //                   .moduleResolution as unknown as keyof typeof ts.ModuleResolutionKind
    //           ]
    //         : undefined,
    //     target: _options.compilerOptions.target
    //         ? ts.ScriptTarget[
    //               _options.compilerOptions
    //                   .target as unknown as keyof typeof ts.ScriptTarget
    //           ]
    //         : undefined,

    //     strictNullChecks: true,
    // };
    const compilerHost = ts.createCompilerHost(options);
    const customCompilerHost: ts.CompilerHost = {
        ...compilerHost,
        getSourceFile,
    };
    const program = ts.createProgram([FILENAME], options, customCompilerHost);
    return { program, sourceFile };
};

export const createProgram = (
    files: string[],
    rootDir: string,
    makeHelperTypesFactory: (fileName: string) => string,
) => {
    const _options = getOptions(rootDir);
    const options = {
        include: _options.include,

        ..._options.compilerOptions,

        target: _options.compilerOptions.target
            ? ts.ScriptTarget[
                  _options.compilerOptions
                      .target as unknown as keyof typeof ts.ScriptTarget
              ]
            : undefined,

        module: _options.compilerOptions.module
            ? ts.ModuleKind[
                  _options.compilerOptions
                      .module as unknown as keyof typeof ts.ModuleKind
              ]
            : undefined,
        moduleDetection: _options.compilerOptions.moduleDetection
            ? ts.ModuleDetectionKind[
                  _options.compilerOptions
                      .moduleDetection as unknown as keyof typeof ts.ModuleDetectionKind
              ]
            : undefined,
        moduleResolution: _options.compilerOptions.moduleResolution
            ? ts.ModuleResolutionKind[
                  _options.compilerOptions
                      .moduleResolution as unknown as keyof typeof ts.ModuleResolutionKind
              ]
            : undefined,

        jsx: _options.compilerOptions.jsx
            ? ts.JsxEmit[
                  _options.compilerOptions
                      .jsx as unknown as keyof typeof ts.JsxEmit
              ]
            : undefined,

        strictNullChecks: true,
    } satisfies ts.CompilerOptions;
    const compilerHost = ts.createCompilerHost(options);

    const typeHelperFiles = new Map<string, ts.SourceFile>();
    const getSourceFile = (
        fileName: string,
        languageVersion: ts.ScriptTarget,
        onError: (message: string) => void,
        ...args: any[]
    ) => {
        // console.log(fileName);
        if (typeHelperFiles.has(fileName)) {
            return typeHelperFiles.get(fileName);
        }

        if (fileName.endsWith("._cobalt_generator_types.ts")) {
            const sourceFile = ts.createSourceFile(
                fileName,
                makeHelperTypesFactory(fileName),
                languageVersion,
                ...args,
            );
            typeHelperFiles.set(fileName, sourceFile);

            return sourceFile;
        }

        return (compilerHost.getSourceFile as any)(
            fileName,
            languageVersion,
            (message: string) => {
                console.error(message);
            },
            ...args,
        );
    };

    const pathAliases = options.paths;
    const pathAliasesKeys = Object.keys(pathAliases ?? {});

    const customCompilerHost: ts.CompilerHost = {
        ...compilerHost,
        getSourceFile,
        resolveModuleNameLiterals: (
            moduleLiterals,
            containingFile,
            redirectedReference,
            options,
            containingSourceFile,
            reusedNames,
        ) => {
            return moduleLiterals.map((moduleLiteral) => {
                let resolvedPath = moduleLiteral.text;
                let alias: string | undefined;
                if (
                    (alias = pathAliasesKeys.find(
                        (key) =>
                            moduleLiteral.text === key ||
                            moduleLiteral.text.startsWith(key),
                    ))
                ) {
                    resolvedPath = path.resolve(
                        options.baseUrl!,
                        options.paths?.[alias]?.[0]!,
                    );

                    // console.log(`${moduleLiteral.text} -> ${resolvedPath}`);
                }

                const resolved = ts.resolveModuleName(
                    resolvedPath,
                    containingFile,
                    options,
                    compilerHost,
                    compilerHost.getModuleResolutionCache?.(),
                    redirectedReference,
                );
                return resolved;
            });
        },
    };

    const program = ts.createProgram(
        files.flatMap((file) => [
            file,
            // path.relative(rootDir, file),
            `${file}._cobalt_generator_types.ts`,
        ]),
        options,
        customCompilerHost,
    );
    return program;
};
