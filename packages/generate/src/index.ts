import path from "path";

import { Collector, gatherMeta } from "./collector";
import { GeneratorSchemaGQL } from "./schema/graphql";
import type { SchemaMeta } from "./collector/types";

export class Generator {
    constructor() {}

    private generateTSTypesFile(schemaMeta: SchemaMeta) {
        const typesFiles: Record<string, string> = {};

        for (const extType of schemaMeta.extendedTypes) {
            const fieldDefs: string[] = [];
            for (const field of extType.fields) {
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
            const tsTypeFileContent = `
                ${extType.description ? `/*\n${extType.description}\n*/` : ""}
                export type ${extType.name} = {
                    ${fieldDefs.join("\n")}
                }
            `;

            typesFiles[extType.name] = tsTypeFileContent;
        }

        typesFiles["index"] = `
            ${Object.keys(typesFiles)
                .map(
                    (typeName) =>
                        `import type { ${typeName} } from "./${typeName}";`,
                )
                .join("\n")}

            export type Types = {
                ${Object.keys(typesFiles)
                    .map((typeName) => `${typeName}: ${typeName},`)
                    .join("\n")}
            }
        `;

        return typesFiles;
    }

    public async generate(operationsDir: string) {
        const serverDir = path.resolve(operationsDir, "..");
        const typesDir = path.join(serverDir, "types");

        const collector = new Collector();
        const schemaMeta = gatherMeta(operationsDir, {}, collector);

        const typesFiles = this.generateTSTypesFile(schemaMeta);
        const schema = new GeneratorSchemaGQL(schemaMeta).generateSchema();

        const opsImports: string[] = [];
        const extTypesImports: string[] = [];
        const queries: string[] = [];
        const mutations: string[] = [];
        const subscriptions: string[] = [];
        const extendedTypes: string[] = [];
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
                    `export const ${name} = Object.fromEntries(Object.entries(T_${name}).map(([fieldName, fieldFunc]) => [fieldName, makeGraphQLFieldResolver(fieldFunc)]));`,
            )
            .join("\n");
        const code = [
            `import { makeGraphQLResolverFn, makeGraphQLFieldResolver } from "@cobalt27/runtime";`,
            ...opsImports,
            ...extTypesImports,
            queries.length && Query,
            mutations.length && Mutation,
            subscriptions.length && Subscription,
            extendedTypes.length && ExtendedTypes,
        ]
            .filter(Boolean)
            .join("\n");

        return { schema, entrypoint: code, tsTypes: typesFiles };
    }
}
