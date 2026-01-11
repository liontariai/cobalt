import fs from "fs";
import path from "path";

import { Collector, gatherMeta } from "./collector";
import { GeneratorSchemaGQL } from "./schema/graphql";
import type { CodegenOptions, SchemaMeta, TypeMeta } from "./collector/types";

import { parse, Lang } from "@ast-grep/napi";
export class Generator {
    constructor() {}

    private generateTSTypesFile(schemaMeta: SchemaMeta) {
        const typesFiles: Record<string, string> = {};

        const typeNames = new Set<string>();
        const unionTypeNames = new Set<string>();
        const unionTypeImports = new Set<string>();

        const makeTypeFields = (t: TypeMeta) => {
            const fieldDefs: string[] = [];
            for (const field of t.fields) {
                let fieldArgs = "";
                if (field.args?.length) {
                    fieldArgs = `(${field.args.map(
                        (a) => `${a.name}: ${a.type.tsTypeName}`,
                    )}) => `;
                }

                fieldDefs.push(
                    `${field.description ? `/*\n${field.description}\n*/` : ""}${field.name}: ${fieldArgs}${field.type.tsTypeName}`,
                );
            }
            return fieldDefs;
        };

        for (const extType of schemaMeta.extendedTypes) {
            const fieldDefs = makeTypeFields(extType);
            const tsTypeFileContent = `
                ${extType.description ? `/*\n${extType.description}\n*/` : ""}
                export type ${extType.name} = {
                    ${fieldDefs.join("\n")}
                }
            `;

            typesFiles[extType.name] = tsTypeFileContent;
            typeNames.add(extType.name);
        }

        for (const unionType of schemaMeta.types.filter((t) => t.isUnion)) {
            if (unionType.isInput) continue;

            const makeTypeFile = (type: TypeMeta) => {
                const types: string[] = [];
                const fieldDefs = makeTypeFields(type);
                const tsTypeFileContent = `
                    ${type.description ? `/*\n${type.description}\n*/` : ""}
                    export type ${type.name.replaceAll("!", "")} = {
                        ${fieldDefs.join("\n")}
                    }
                `;

                typesFiles[type.name.replaceAll("!", "")] = tsTypeFileContent;
                types.push(type.name.replaceAll("!", ""));
                return type.name.replaceAll("!", "");
            };

            const typeDefs: string[] = [];
            for (const type of unionType.possibleTypes) {
                const t = makeTypeFile(type);
                typeDefs.push(t);
                unionTypeImports.add(t);
            }

            const tsTypeFileContent = `
                ${typeDefs
                    .map(
                        (typeName) =>
                            `import type { ${typeName} } from "./${typeName}";`,
                    )
                    .join("\n")}
                
                ${unionType.description ? `/*\n${unionType.description}\n*/` : ""}
                export type ${unionType.name.replaceAll("!", "")} = ${typeDefs.join(" | ")};
                export type ${unionType.name.replaceAll("!", "")}ResolveToTypename = ${typeDefs.map((td) => `"${td}"`).join(" | ")};
            `;
            typesFiles[unionType.name.replaceAll("!", "")] = tsTypeFileContent;

            unionTypeNames.add(unionType.name.replaceAll("!", ""));
        }

        typesFiles["index"] = `
            export type Types = {
                ${Array.from(typeNames)
                    .map(
                        (typeName) =>
                            `${typeName}: import("./${typeName}").${typeName},`,
                    )
                    .join("\n")}
            }
            export type Unions = {
                ${Array.from(unionTypeNames)
                    .map(
                        (typeName) =>
                            `${typeName}: import("./${typeName}").${typeName},`,
                    )
                    .join("\n")}
            }
            export type UnionsResolveToTypename = {
                ${Array.from(unionTypeNames)
                    .map(
                        (typeName) =>
                            `${typeName}: import("./${typeName}").${typeName}ResolveToTypename,`,
                    )
                    .join("\n")}
            }
        `;

        return typesFiles;
    }

    private syncUnionOperationResolveTypeFunctions(
        schemaMeta: SchemaMeta,
        options: { $$typesSymbol?: string } = {},
    ) {
        const $$typesSymbol = options.$$typesSymbol ?? 'import("$$types")';

        for (const operation of schemaMeta.operations) {
            if (
                operation.type.isUnion &&
                !operation.type.isScalar &&
                operation.type.isObject
            ) {
                const pureOpTypeName = operation.type.name.replaceAll("!", "");
                const code = fs.readFileSync(operation.file, "utf-8");
                const ast = parse(Lang.TypeScript, code);
                const root = ast.root();

                // Find the operation function (e.g., export function Query(...))
                // Handle regular, async, and async generator functions
                const operationName = operation.operation;
                const patterns = [
                    `export async function* ${operationName}($$$ARGS)$$$RET { $$$BODY }`,
                    `export async function ${operationName}($$$ARGS)$$$RET { $$$BODY }`,
                    `export function ${operationName}($$$ARGS)$$$RET { $$$BODY }`,
                ];

                const operationFunctionMatch = patterns
                    .map((pattern) => root.find(pattern))
                    .find(Boolean);
                if (!operationFunctionMatch) continue;

                // Find if resolveType already exists for this operation
                // Search for any .resolveType assignment and check if it matches our operation
                const resolveTypePattern =
                    "$OP.resolveType = ($PARAMS): $RET => $BODY";
                const allResolveTypeMatches = root.findAll(resolveTypePattern);
                const resolveTypeMatch =
                    allResolveTypeMatches.find((match) => {
                        const opMatch = match.getMatch("OP");
                        return opMatch?.text() === operation.operation;
                    }) || null;

                const resolveTypeCode = [
                    "",
                    "// Your resolver returns a Union Type. Therefore you must provide a resolveType function that resolves the abstract union type to a concrete type by it's typename.",
                    "// The following fully-typed template has been added by cobalt. Please make sure it resolves correctly, like the types indicate.",
                    `${operation.operation}.resolveType = (value: ${$$typesSymbol}.Unions["${pureOpTypeName}"]): ${$$typesSymbol}.UnionsResolveToTypename["${pureOpTypeName}"] => {`,
                    `    switch(value){`,
                    `        default:`,
                    `            return "";`,
                    `    }`,
                    `};`,
                ].join("\n");

                let newCode: string;

                if (resolveTypeMatch) {
                    const args =
                        resolveTypeMatch.getMatch("PARAMS")?.text() || "";

                    const regexUnionTypeImport = new RegExp(
                        `${RegExp.escape($$typesSymbol)}\.Unions\\[(.*)\\]`,
                    );

                    const oldTypenameMatch =
                        regexUnionTypeImport.exec(args)?.[1];
                    const updatedResolveTypeWithBody = oldTypenameMatch
                        ? resolveTypeMatch
                              .text()
                              .replaceAll(
                                  oldTypenameMatch.slice(1, -1),
                                  pureOpTypeName,
                              )
                        : resolveTypeMatch.text();
                    const range = resolveTypeMatch.range();
                    newCode =
                        code.slice(0, range.start.index) +
                        updatedResolveTypeWithBody +
                        code.slice(range.end.index);
                } else {
                    // Insert resolveType right after the operation function
                    const range = operationFunctionMatch.range();
                    const insertPosition = range.end.index;
                    newCode =
                        code.slice(0, insertPosition) +
                        "\n" +
                        resolveTypeCode +
                        code.slice(insertPosition);
                }

                fs.writeFileSync(operation.file, newCode, "utf-8");
            }
        }
    }

    private syncUnionTypeResolveTypeFunction(
        unionType: TypeMeta,
        file: string,
        options: { createFile?: boolean; $$typesSymbol?: string } = {},
    ) {
        if (!fs.existsSync(file) && options.createFile) {
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, "", "utf-8");
        }

        const $$typesSymbol = options.$$typesSymbol ?? 'import("$$types")';

        if (unionType.isUnion && !unionType.isScalar && unionType.isObject) {
            const pureOpTypeName = unionType.name.replaceAll("!", "");
            const code = fs.readFileSync(file, "utf-8");
            const ast = parse(Lang.TypeScript, code);
            const root = ast.root();

            // Find if resolveType already exists for this operation
            // Search for any .resolveType assignment and check if it matches our operation
            const resolveTypePattern =
                "export const resolveType = ($PARAMS): $RET => $BODY";
            const resolveTypeMatch = root.find(resolveTypePattern);

            const resolveTypeCode = [
                "",
                "// Your resolver returns a Union Type. Therefore you must provide a resolveType function that resolves the abstract union type to a concrete type by it's typename.",
                "// The following fully-typed template has been added by cobalt. Please make sure it resolves correctly, like the types indicate.",
                `export const resolveType = (value: ${$$typesSymbol}.Unions["${pureOpTypeName}"]): ${$$typesSymbol}.UnionsResolveToTypename["${pureOpTypeName}"] => {`,
                `    switch(value){`,
                `        default:`,
                `            return "";`,
                `    }`,
                `};`,
            ].join("\n");

            let newCode: string;

            if (resolveTypeMatch) {
                const args = resolveTypeMatch.getMatch("PARAMS")?.text() || "";

                const regexUnionTypeImport = new RegExp(
                    `${RegExp.escape($$typesSymbol)}\.Unions\\[(.*)\\]`,
                );

                const oldTypenameMatch = regexUnionTypeImport.exec(args)?.[1];
                const updatedResolveTypeWithBody = oldTypenameMatch
                    ? resolveTypeMatch
                          .text()
                          .replaceAll(
                              oldTypenameMatch.slice(1, -1),
                              pureOpTypeName,
                          )
                    : resolveTypeMatch.text();
                const range = resolveTypeMatch.range();
                newCode =
                    code.slice(0, range.start.index) +
                    updatedResolveTypeWithBody +
                    code.slice(range.end.index);
            } else {
                newCode = resolveTypeCode + "\n" + code;
            }

            fs.writeFileSync(file, newCode, "utf-8");
        }
    }

    public async generate(operationsDir: string, options: CodegenOptions = {}) {
        const serverDir = path.resolve(operationsDir, "..");
        const typesDir = path.join(serverDir, "types");
        const unionsDir = path.join(serverDir, "unions");

        const collector = new Collector();
        const schemaMeta = await gatherMeta(operationsDir, options, collector);

        const typesFiles = this.generateTSTypesFile(schemaMeta);
        this.syncUnionOperationResolveTypeFunctions(schemaMeta, {
            $$typesSymbol: options.$$typesSymbol ?? 'import("$$types")',
        });

        const schema = new GeneratorSchemaGQL(schemaMeta).generateSchema();

        const opsImports: string[] = [];
        const extTypesImports: string[] = [];
        const unionTypesImports: string[] = [];

        const queries: string[] = [];
        const mutations: string[] = [];
        const subscriptions: string[] = [];
        const extendedTypes: string[] = [];

        const unionTypes: { typeName: string; importName: string }[] = [];

        for (const operation of schemaMeta.operations) {
            opsImports.push(
                `import { ${operation.operation} as ${operation.name} } from "${path.resolve(operationsDir, operation.file)}";`,
            );
            if (operation.operation === "Query") {
                queries.push(operation.name);
            } else if (operation.operation === "Mutation") {
                mutations.push(operation.name);
            } else if (operation.operation === "Subscription") {
                subscriptions.push(operation.name);
            }
        }

        const unionOps = new Set<TypeMeta>();
        for (const unionOperation of schemaMeta.operations.filter(
            (o) => o.type.isUnion,
        )) {
            unionOps.add(unionOperation.type);

            const importName = `U_${unionOperation.operation}_${unionOperation.type.name.replaceAll("!", "")}`;
            opsImports.push(
                `import { ${unionOperation.operation} as ${importName} } from "${path.resolve(operationsDir, unionOperation.file)}";`,
            );
            unionTypes.push({
                typeName: unionOperation.type.name.replaceAll("!", ""),
                importName,
            });
        }
        for (const unionType of schemaMeta.types.filter((t) => t.isUnion)) {
            if (unionOps.has(unionType)) continue;

            const filename = path.join(
                unionsDir,
                `${unionType.name.replaceAll("!", "")}.ts`,
            );
            this.syncUnionTypeResolveTypeFunction(unionType, filename, {
                createFile: true,
                $$typesSymbol: options.$$typesSymbol,
            });

            const importName = `U_${unionType.name.replaceAll("!", "")}`;
            unionTypesImports.push(
                `import * as ${importName} from "${path.resolve(unionsDir, `${unionType.name.replaceAll("!", "")}.ts`)}";`,
            );
            unionTypes.push({
                typeName: unionType.name.replaceAll("!", ""),
                importName,
            });

            if (options.onFileCollected) {
                await options.onFileCollected(filename, unionType, "union");
            }
        }

        for (const extType of schemaMeta.extendedTypes) {
            opsImports.push(
                `import * as T_${extType.name} from "${path.resolve(typesDir, `${extType.name}.ts`)}";`,
            );
            extendedTypes.push(extType.name);
        }

        const Query = `export const Query = {
            ${queries
                .map(
                    (name) =>
                        `${name}: makeGraphQLResolverFn(${name}, "${name}")`,
                )
                .join(",\n")}
        };`;
        const Mutation = `export const Mutation = {
            ${mutations
                .map(
                    (name) =>
                        `${name}: makeGraphQLResolverFn(${name}, "${name}")`,
                )
                .join(",\n")}
        };`;
        const Subscription = `export const Subscription = {
            ${subscriptions
                .map(
                    (name) =>
                        `${name}: makeGraphQLResolverFn(${name}, "${name}", true)`,
                )
                .join(",\n")}
        };`;
        const ExtendedTypes = extendedTypes
            .map(
                (name) =>
                    `export const ${name} = Object.fromEntries([
                        ...Object.entries(T_${name}).map(([fieldName, fieldFunc]) => [fieldName, makeGraphQLFieldResolver(fieldFunc)]),
                        ["__typename", makeGraphQLFieldResolver(() => "${name}")],
                    ]);`,
            )
            .join("\n");

        const UnionTypes = unionTypes
            .map((u) => {
                if (extendedTypes.includes(u.typeName)) {
                    return `${u.typeName}.__resolveType = ${u.importName}.resolveType;`;
                }
                return `export const ${u.typeName} = {
                        __resolveType: ${u.importName}.resolveType,
                    }`;
            })
            .join("\n");

        const code = [
            `import { makeGraphQLResolverFn, makeGraphQLFieldResolver } from "@cobalt27/runtime";`,
            ...opsImports,
            ...extTypesImports,
            ...unionTypesImports,
            queries.length && Query,
            mutations.length && Mutation,
            subscriptions.length && Subscription,
            extendedTypes.length && ExtendedTypes,
            unionTypes.length && UnionTypes,
        ]
            .filter(Boolean)
            .join("\n");

        return { schema, entrypoint: code, tsTypes: typesFiles };
    }
}
