import fs from "fs";
import path from "path";

import { Collector, gatherMeta } from "./collector";
import { GeneratorSchemaGQL } from "./schema/graphql";
import type { CodegenOptions, SchemaMeta, TypeMeta } from "./collector/types";

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
            if (operation.type.isUnion) {
                const pureOpTypeName = operation.type.name.replaceAll("!", "");

                const reg = new RegExp(
                    `${operation.operation}\.resolveType(.*)\{`,
                );
                let code = fs.readFileSync(operation.file, "utf-8");
                if (!reg.test(code)) {
                    code += [
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
                    fs.writeFileSync(operation.file, code, "utf-8");
                } else {
                    // If resolveType is present, update the function to use new value and return types
                    code = code.replace(
                        new RegExp(`${operation.operation}\.resolveType(.*)\{`),
                        `${operation.operation}.resolveType = (value: import("$$$types").Unions["${pureOpTypeName}"]): import("$$$types").UnionsResolveToTypename["${pureOpTypeName}"] => {`,
                    );
                    fs.writeFileSync(operation.file, code, "utf-8");
                }
            }
        }
    }

    public async generate(operationsDir: string, options: CodegenOptions = {}) {
        const serverDir = path.resolve(operationsDir, "..");
        const typesDir = path.join(serverDir, "types");

        const collector = new Collector();
        const schemaMeta = gatherMeta(operationsDir, options, collector);

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
