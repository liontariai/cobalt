import type {
    TypeMeta,
    SchemaMeta,
    OperationMeta,
} from "../../collector/types";

export class GeneratorSchemaGQL {
    public static ScalarTypeMap: Map<string, string> = new Map([
        ["string", "String"],
        ["number", "Int"],
        ["boolean", "Boolean"],
    ]);
    public ScalarTypeMap: Map<string, string> =
        GeneratorSchemaGQL.ScalarTypeMap;

    constructor(private readonly schemaMeta: SchemaMeta) {}

    public makeScalarTypes(): string {
        const scalars: string[] = [];
        for (const typeMeta of this.schemaMeta.types) {
            if (
                typeMeta.isScalar &&
                !typeMeta.isList &&
                !typeMeta.isUnion &&
                !typeMeta.isInput &&
                !typeMeta.isEnum &&
                !typeMeta.parentType?.isUnion &&
                !["ID", "Int", "String", "Boolean"].includes(
                    this.ScalarTypeMap.get(typeMeta.name.replaceAll("!", "")) ??
                        typeMeta.name,
                )
            ) {
                scalars.push(
                    this.createCustomScalarType(
                        typeMeta,
                        typeMeta.description ?? "",
                    ),
                );
            }
        }
        return scalars.join("\n");
    }

    public makeEnumTypes(): string {
        const enums: string[] = [];
        for (const typeMeta of this.schemaMeta.types) {
            if (typeMeta.isEnum) {
                const name = typeMeta.name.endsWith("!")
                    ? typeMeta.name.slice(0, -1)
                    : typeMeta.name;

                enums.push(
                    `${typeMeta.description ? `"""\n${typeMeta.description}\n"""` : ""}
                    enum ${name} {
                        ${typeMeta.enumValues
                            .map((value) => `${value.name}`)
                            .join("\n")}
                    }`,
                );
            }
        }
        return enums.filter((v, i, arr) => i === arr.indexOf(v)).join("\n");
    }

    private _typedefMap: Map<string, string> = new Map();
    private getOrMakeTypedef(typeMeta: TypeMeta): string {
        if (this._typedefMap.has(typeMeta.name) || typeMeta.isEnum) {
            return "";
        }

        let name = typeMeta.name;
        name = typeMeta.isList
            ? name.slice(typeMeta.isList, -typeMeta.isList)
            : name;

        const typedef = `@typedef {${typeMeta.scalarTSType}} ${name}`;
        this._typedefMap.set(name, typedef);

        return typedef;
    }
    private typeMetaNameToTsType(typeMeta: TypeMeta): string {
        const name = typeMeta.isScalar
            ? typeMeta.isList
                ? `${typeMeta.name.slice(typeMeta.isList, -typeMeta.isList)}`
                : typeMeta.name
            : typeMeta.scalarTSType!;

        return typeMeta.isList
            ? `${name}${Array(typeMeta.isList).fill("[]").join("")}`
            : name;
    }
    private typeMetaNameToGqlTypeName(typeMeta: TypeMeta): string {
        let name = typeMeta.isList
            ? `${typeMeta.name.slice(typeMeta.isList, -typeMeta.isList)}`
            : typeMeta.name;

        name = this.ScalarTypeMap.get(name.replaceAll("!", "")) ?? name;
        name = typeMeta.isNonNull && !name.endsWith("!") ? `${name}!` : name;

        return typeMeta.isList
            ? `${Array(typeMeta.isList).fill("[").join("")}${name}${Array(
                  typeMeta.isList,
              )
                  .fill("]")
                  .join("")}`
            : name;
    }

    public makeInputTypes(): string {
        const inputs: string[] = [];
        for (const typeMeta of this.schemaMeta.types) {
            if (typeMeta.isInput && !typeMeta.isUnion) {
                let name = typeMeta.name;
                name = typeMeta.isList
                    ? name.slice(typeMeta.isList, -typeMeta.isList)
                    : name;
                name = name.endsWith("!") ? name.slice(0, -1) : name;

                const fieldDefs: string[] = [];
                for (const field of typeMeta.inputFields) {
                    fieldDefs.push(
                        `${field.description ? `"""\n${field.description}\n"""` : ""}${field.name}: ${this.typeMetaNameToGqlTypeName(
                            field.type,
                        )}`,
                    );
                }
                inputs.push(
                    `
                    ${typeMeta.description ? `"""\n${typeMeta.description}\n"""` : ""}
                    input ${name} {
                        ${fieldDefs.join("\n")}
                    }`,
                );
            }
        }
        return inputs.filter((v, i, arr) => i === arr.indexOf(v)).join("\n");
    }

    public makeObjectTypes(): string {
        const objects: string[] = [];
        for (const typeMeta of this.schemaMeta.types) {
            if (typeMeta.isObject) {
                let name = typeMeta.name;
                name = typeMeta.isList
                    ? name.slice(typeMeta.isList, -typeMeta.isList)
                    : name;
                name = name.endsWith("!") ? name.slice(0, -1) : name;

                const fieldDefs: string[] = [];
                for (const field of typeMeta.fields) {
                    let fieldArgs = "";
                    if (field.args?.length) {
                        fieldArgs = `(${field.args.map(
                            (a) =>
                                `${a.name}: ${this.typeMetaNameToGqlTypeName(
                                    a.type,
                                )}`,
                        )})`;
                    }

                    fieldDefs.push(
                        `${field.description ? `"""\n${field.description}\n"""` : ""}${field.name}${fieldArgs}: ${this.typeMetaNameToGqlTypeName(
                            field.type,
                        )}`,
                    );
                }
                objects.push(
                    `
                    ${typeMeta.description ? `"""\n${typeMeta.description}\n"""` : ""}
                    type ${name} {
                        ${fieldDefs.join("\n")}
                    }`,
                );
            }
        }
        return objects.filter((v, i, arr) => i === arr.indexOf(v)).join("\n");
    }

    public createCustomScalarType(
        typeMeta: TypeMeta,
        description: string,
    ): string {
        const typeName = typeMeta.name.endsWith("!")
            ? typeMeta.name.slice(0, -1)
            : typeMeta.name;
        return `
        """
        ${description}
        ${this.getOrMakeTypedef(typeMeta)}
        @type {${typeName}}
        """
        scalar ${typeName}
        `;
    }

    public makeUnionTypes(): string {
        const unions: string[] = [];
        for (const typeMeta of this.schemaMeta.types) {
            if (typeMeta.isUnion) {
                if (
                    typeMeta.isInput ||
                    typeMeta.possibleTypes.some((t) => t.isScalar || t.isEnum)
                ) {
                    unions.push(
                        this.createCustomScalarType(
                            typeMeta,
                            typeMeta.description ??
                                "A custom scalar type that represents a union of input types, which is not supported by GraphQL natively.",
                        ),
                    );
                } else {
                    let name = typeMeta.name;
                    name = typeMeta.isList
                        ? name.slice(typeMeta.isList, -typeMeta.isList)
                        : name;
                    name = name.endsWith("!") ? name.slice(0, -1) : name;

                    unions.push(
                        `${typeMeta.description ? `"""\n${typeMeta.description}\n"""` : ""}
                        union ${typeMeta.name} = ${typeMeta.possibleTypes
                            .map((type) => {
                                let n =
                                    this.ScalarTypeMap.get(
                                        type.name.replaceAll("!", ""),
                                    ) ?? type.name.replaceAll("!", "");

                                return `${n}${type.isNonNull ? "!" : ""}`;
                            })
                            .join(" | ")}`,
                    );
                }
            }
        }
        return unions.filter((v, i, arr) => i === arr.indexOf(v)).join("\n");
    }

    public makeOperationTypes(): string {
        const ops = this.schemaMeta.operations.map(
            (operation) =>
                [
                    operation,
                    `${operation.description ? `"""\n${operation.description}\n"""` : ""}${operation.name}${
                        operation.args.length
                            ? `(${operation.args
                                  .map(
                                      (arg) =>
                                          `${
                                              arg.description
                                                  ? `"""\n${arg.description}\n"""`
                                                  : ""
                                          }${arg.name}: ${this.typeMetaNameToGqlTypeName(
                                              arg.type,
                                          )}\n`,
                                  )
                                  .join(", ")})`
                            : ""
                    }: ${this.typeMetaNameToGqlTypeName(operation.type)}`,
                ] as [OperationMeta, string],
        );

        const hasQuery = ops.some((op) => op[0].operation === "Query");
        const hasMutation = ops.some((op) => op[0].operation === "Mutation");
        const hasSubscription = ops.some(
            (op) => op[0].operation === "Subscription",
        );

        const query = hasQuery
            ? `type Query {
            ${ops
                .filter((op) => op[0].operation === "Query")
                .map((op) => op[1])
                .join("\n")}
        }`
            : "";
        const mutation = hasMutation
            ? `type Mutation {
            ${ops
                .filter((op) => op[0].operation === "Mutation")
                .map((op) => op[1])
                .join("\n")}
        }`
            : "";
        const subscription = hasSubscription
            ? `type Subscription {
            ${ops
                .filter((op) => op[0].operation === "Subscription")
                .map((op) => op[1])
                .join("\n")}
        }`
            : "";

        return [query, mutation, subscription].join("\n");
    }

    public generateSchema(): string {
        return [
            this.makeScalarTypes(),
            this.makeUnionTypes(),
            this.makeEnumTypes(),
            this.makeInputTypes(),
            this.makeObjectTypes(),
            this.makeOperationTypes(),
        ].join("\n");
    }
}
