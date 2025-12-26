import type {
    OperationMeta,
    SchemaMeta,
    TypeMeta,
} from "../../collector/types";

export class GeneratorSchemaGQL {
    public static ScalarTypeMap: Map<string, string> = new Map([
        ["string", "String"],
        ["number", "Float"],
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
                !["ID", "Int", "String", "Boolean", "Float"].includes(
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
                let name = typeMeta.name;

                name = name.replaceAll("[", "").replaceAll("]", "");
                name = name.replaceAll("!", "");

                const enumValueTypeDefs = typeMeta.enumValues
                    .map((v) =>
                        v.description?.startsWith("@property")
                            ? v.description
                            : null,
                    )
                    .filter(Boolean);

                enums.push(
                    `"""
${typeMeta.description ?? ""}
${enumValueTypeDefs.length ? `@typedef {object} ${name}` : ""}
${enumValueTypeDefs.join("\n")}
${enumValueTypeDefs.length ? `@type {${name}}` : ""}
                    """
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
            ? name.replaceAll("[", "").replaceAll("]", "")
            : name;

        const typedef = `@typedef {${typeMeta.scalarTSType}} ${name}`;
        this._typedefMap.set(name, typedef);

        return typedef;
    }
    private typeMetaNameToTsType(typeMeta: TypeMeta): string {
        const name = typeMeta.isScalar
            ? typeMeta.isList
                ? `${typeMeta.name.replaceAll("[", "").replaceAll("]", "")}`
                : typeMeta.name
            : typeMeta.scalarTSType!;

        return typeMeta.isList
            ? `${name}${Array(typeMeta.isList).fill("[]").join("")}`
            : name;
    }
    private typeMetaNameToGqlTypeName(typeMeta: TypeMeta): string {
        let name = typeMeta.isList
            ? `${typeMeta.name.replaceAll("[", "").replaceAll("]", "")}`
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
                // remove list brackets from name, the array is handled (hoisted) to the prop that uses it
                name = name.replaceAll("[", "").replaceAll("]", "");
                name = name.replaceAll("!", "");

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
                // remove list brackets from name, the array is handled (hoisted) to the prop that uses it
                name = name.replaceAll("[", "").replaceAll("]", "");
                name = name.replaceAll("!", "");

                if (typeMeta.fields.length === 0) {
                    console.warn(
                        `[makeObjectTypes]: Type "${name}" as zero fields. Skipping in output GQL schema.`,
                    );
                    continue;
                }
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
        const typedef = this.getOrMakeTypedef(typeMeta);
        if (!typedef.length) return "";

        let typeName = typeMeta.name;

        typeName = typeName.replaceAll("!", "");
        // remove list brackets from name, the array is handled (hoisted) to the prop that uses it
        typeName = typeName.replaceAll("[", "").replaceAll("]", "");

        return `
        """
        ${description}
        ${typedef}
        @type {${typeName}}
        """
        scalar ${typeName}
        `;
    }

    public makeUnionTypes(): string {
        const unions: string[] = [];
        for (const typeMeta of this.schemaMeta.types) {
            if (typeMeta.isUnion && typeMeta.possibleTypes.length) {
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

                    name = name.replaceAll("!", "");
                    // remove list brackets from name, the array is handled (hoisted) to the prop that uses it
                    name = name.replaceAll("[", "").replaceAll("]", "");

                    unions.push(
                        `${typeMeta.description ? `"""\n${typeMeta.description}\n"""` : ""}
                        union ${name} = ${typeMeta.possibleTypes
                            .map((type) => {
                                let n =
                                    this.ScalarTypeMap.get(
                                        type.name.replaceAll("!", ""),
                                    ) ?? type.name.replaceAll("!", "");

                                n = n.replaceAll("!", "");
                                // remove list brackets from name, the array is handled (hoisted) to the prop that uses it
                                n = n.replaceAll("[", "").replaceAll("]", "");

                                return n;
                            })
                            .join(" | ")}`,
                    );
                }
            }
        }
        return unions
            .filter(Boolean)
            .filter((v, i, arr) => i === arr.indexOf(v))
            .join("\n");
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
