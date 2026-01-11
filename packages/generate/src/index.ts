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

    private syncResolveTypeFunctions(schemaMeta: SchemaMeta) {
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
                    `export async function* ${operationName}($$$ARGS): $$$RET { $$$BODY }`,
                    `export async function ${operationName}($$$ARGS): $$$RET { $$$BODY }`,
                    `export function ${operationName}($$$ARGS): $$$RET { $$$BODY }`,
                ];

                const operationFunctionMatch = patterns
                    .map((pattern) => root.find(pattern))
                    .find(Boolean);
                if (!operationFunctionMatch) continue;

                // Find if resolveType already exists for this operation
                // Search for any .resolveType assignment and check if it matches our operation
                const resolveTypePattern = `$OP.resolveType = $$$ASSIGNMENT`;
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
                    `${operation.operation}.resolveType = (value: import("$$types").Unions["${pureOpTypeName}"]): import("$$types").UnionsResolveToTypename["${pureOpTypeName}"] => {`,
                    `    switch(value){`,
                    `        default:`,
                    `            return "";`,
                    `    }`,
                    `};`,
                ].join("\n");

                let newCode: string;

                if (resolveTypeMatch) {
                    // Update existing resolveType function signature
                    const resolveTypeNode = resolveTypeMatch;
                    const updatedResolveType = `${operation.operation}.resolveType = (value: import("$$types").Unions["${pureOpTypeName}"]): import("$$types").UnionsResolveToTypename["${pureOpTypeName}"] => {`;

                    // Extract the function body from the existing resolveType
                    const assignmentMatch =
                        resolveTypeNode.getMatch("$$$ASSIGNMENT");
                    if (assignmentMatch) {
                        // Try to extract the body from arrow function
                        const arrowFunctionPattern = `($$$PARAMS) => { $$$BODY }`;
                        const arrowMatch =
                            assignmentMatch.find(arrowFunctionPattern);
                        if (arrowMatch) {
                            const body =
                                arrowMatch.getMatch("$$$BODY")?.text() || "";
                            const updatedResolveTypeWithBody = `${updatedResolveType}\n${body}}`;
                            const range = resolveTypeNode.range();
                            newCode =
                                code.slice(0, range.start.index) +
                                updatedResolveTypeWithBody +
                                code.slice(range.end.index);
                        } else {
                            // Fallback: replace with new signature and default body
                            const range = resolveTypeNode.range();
                            newCode =
                                code.slice(0, range.start.index) +
                                updatedResolveType +
                                [
                                    "",
                                    `    switch(value){`,
                                    `        default:`,
                                    `            return "";`,
                                    `    }`,
                                    `};`,
                                ].join("\n") +
                                code.slice(range.end.index);
                        }
                    } else {
                        // Fallback: replace the entire assignment
                        const range = resolveTypeNode.range();
                        newCode =
                            code.slice(0, range.start.index) +
                            updatedResolveType +
                            [
                                "",
                                `    switch(value){`,
                                `        default:`,
                                `            return "";`,
                                `    }`,
                                `};`,
                            ].join("\n") +
                            code.slice(range.end.index);
                    }
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

    public async generate(operationsDir: string, options: CodegenOptions = {}) {
        const serverDir = path.resolve(operationsDir, "..");
        const typesDir = path.join(serverDir, "types");

        const collector = new Collector();
        const schemaMeta = await gatherMeta(operationsDir, options, collector);

        const typesFiles = this.generateTSTypesFile(schemaMeta);
        this.syncResolveTypeFunctions(schemaMeta);

        const schema = new GeneratorSchemaGQL(schemaMeta).generateSchema();

        const opsImports: string[] = [];
        const extTypesImports: string[] = [];
        const queries: string[] = [];
        const mutations: string[] = [];
        const subscriptions: string[] = [];
        const extendedTypes: string[] = [];
        const unionOperations: { typeName: string; importName: string }[] = [];
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

        for (const unionOperation of schemaMeta.operations.filter(
            (o) => o.type.isUnion,
        )) {
            const importName = `U_${unionOperation.operation}_${unionOperation.type.name.replaceAll("!", "")}`;
            opsImports.push(
                `import { ${unionOperation.operation} as ${importName} } from "${path.resolve(operationsDir, unionOperation.file)}";`,
            );
            unionOperations.push({
                typeName: unionOperation.type.name.replaceAll("!", ""),
                importName,
            });
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

        const UnionTypes = unionOperations
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
            queries.length && Query,
            mutations.length && Mutation,
            subscriptions.length && Subscription,
            extendedTypes.length && ExtendedTypes,
            unionOperations.length && UnionTypes,
        ]
            .filter(Boolean)
            .join("\n");

        return { schema, entrypoint: code, tsTypes: typesFiles };
    }
}
