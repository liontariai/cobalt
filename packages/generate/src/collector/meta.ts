import path from "path";
import * as ts from "typescript";
import { Collector } from ".";
import type {
    FieldMeta,
    ParameterMeta,
    SchemaMeta,
    TypeMeta,
    OperationMeta,
    CodegenOptions,
    OperationType,
} from "./types";
export {
    type FieldMeta,
    type SchemaMeta,
    type TypeMeta,
    type ParameterMeta,
    type OperationMeta,
    type CodegenOptions,
};

import fs from "fs";
import { Glob } from "bun";
import { createProgram } from "./util";

const camelCase = (parts: string[]) => {
    return parts
        .map((part, index) =>
            index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
        )
        .join("");
};

const RE_OPERATION_TYPE =
    /export (async )?function(\*)? (Query|Mutation|Subscription)/;

const makeHelperTypes = (
    filename: string,
    operationsDir: string,
    typesDir?: string,
) => {
    const fileIsOperation = filename.startsWith(operationsDir);
    const fileIsType = typesDir && filename.startsWith(typesDir);

    if (fileIsOperation) {
        return `
        /// <reference types="@cobalt27/runtime" />
        import type * as F from "${filename.replace(
            "._cobalt_generator_types.ts",
            "",
        )}";
        
        type exportedKeys = keyof typeof F;
        type Ops = {
            Query: Extract<exportedKeys, "Query"> extends "Query" ? typeof F["Query"] : never;
            Mutation: Extract<exportedKeys, "Mutation"> extends "Mutation" ? typeof F["Mutation"] : never;
            Subscription: Extract<exportedKeys, "Subscription"> extends "Subscription" ? typeof F["Subscription"] : never;
        }

        type Op = Ops[Extract<exportedKeys, keyof Ops>];

        type Args = Parameters<Op>;
        type Ret = Awaited<ReturnType<Op>> extends AsyncGenerator<infer T, any, any> ? T : Awaited<ReturnType<Op>>;

        type __typename = Extract<exportedKeys, "__typename"> extends "__typename"
            ? typeof F.__typename
            : never;

        type RESOLVER = {
            args: Args;
            return: Ret;
            __typename: __typename;
        };
        `;
    } else if (fileIsType) {
        return `
        /// <reference types="@cobalt27/runtime" />
        import type * as F from "${filename.replace(
            "._cobalt_generator_types.ts",
            "",
        )}";
        
        type exportedKeys = keyof typeof F;
        type fieldsFuncs = {
            [f in exportedKeys]: (typeof F)[f] extends (...args: any[]) => any
                ? (typeof F)[f]
                : never;
        };
        type FilterKeysWithNever<T> = {
            [k in keyof T]: T[k] extends never ? never : k;
        }[keyof T];

        type FIELDS = {
            args: {
                [k in FilterKeysWithNever<fieldsFuncs>]: Parameters<fieldsFuncs[k]>;
            };
            returns: {
                [k in FilterKeysWithNever<fieldsFuncs>]: ReturnType<fieldsFuncs[k]>;
            };
        };

        `;
    }
    return "";
};

export const gatherMeta = (
    operationsDir: string,
    options: CodegenOptions,
    collector: Collector,
): SchemaMeta => {
    const meta: SchemaMeta = {
        types: [],
        operations: [],
        customScalars: [],

        extendedTypes: [],
    };
    const collectRenamedTypes = new Map<string, string>();

    operationsDir = path.resolve(operationsDir);
    const serverDir = path.resolve(operationsDir, "..");
    const typesDir = path.join(serverDir, "types");

    const files = [
        ...new Glob(`${operationsDir}/**/*.ts`).scanSync(),

        // the order is important, to have all types in the collector already
        // and only extend them with additional field definitions
        ...(fs.existsSync(typesDir)
            ? new Glob(`${typesDir}/**/*.ts`).scanSync()
            : []),
    ].filter(Boolean) as string[];

    const program = createProgram(files, serverDir, (fileName) =>
        makeHelperTypes(fileName, operationsDir, typesDir),
    );
    const checker = program.getTypeChecker();

    for (const file of files) {
        const originalSourceFile = program.getSourceFile(file);
        if (!originalSourceFile) continue;

        const content = fs.readFileSync(file, "utf-8");

        const fileType: "operation" | "type" | "unknown" = file.startsWith(
            operationsDir,
        )
            ? "operation"
            : file.startsWith(typesDir)
              ? "type"
              : "unknown";

        if (fileType === "unknown") continue;
        if (fileType === "operation") {
            const operationType = content.match(RE_OPERATION_TYPE)?.[3] as
                | OperationType
                | undefined;

            if (!operationType) continue;

            const sourceFile = program.getSourceFile(
                `${file}._cobalt_generator_types.ts`,
            );
            if (!sourceFile) continue;

            const namespacingArray = file
                .replace(operationsDir, "")
                .split("/")
                .slice(0, -1)
                .filter(Boolean);
            const filename = file.split(path.sep).pop()!;

            const symbols = checker.getSymbolsInScope(
                sourceFile!.endOfFileToken,
                ts.SymbolFlags.All,
            );

            const resolverName = `${operationType}::${file.replace(".ts", "")}`;
            const resolverSymbol = symbols.find((s) => s.name === "RESOLVER")!;
            const resolverType =
                checker.getDeclaredTypeOfSymbol(resolverSymbol);
            const resolverMeta = gatherMetaForType(
                "",
                { type: resolverType, symbol: resolverSymbol },
                { checker, sourceFile },
                collector,
                collectRenamedTypes,
                [`${resolverName}:`],
            );

            collector.removeType("RESOLVER");
            collector.removeType("RESOLVER!");

            resolverMeta.name = resolverName;
            collector.addType(resolverMeta);

            const args = resolverMeta.fields.find((f) => f.name === "args")!;
            const ret = resolverMeta.fields.find((f) => f.name === "return")!;
            const __typename = resolverMeta.fields.find(
                (f) => f.name === "__typename",
            );

            if (__typename && __typename.type.isEnum) {
                const finalTypeName =
                    Array(ret.type.isList).fill("[").join("") +
                    __typename.type.enumValues[0].name +
                    Array(ret.type.isList).fill("]").join("");
                collector.removeType(__typename.type.name);

                collectRenamedTypes.set(ret.type.name, finalTypeName);

                // collector.removeType(ret.type.name);
                ret.type.name = finalTypeName;
                collector.addType(ret.type);
            }

            meta.operations.push({
                file: file,
                operation: operationType,
                name: camelCase([
                    ...namespacingArray,
                    filename === "index.ts" ? "" : filename,
                ]).replaceAll(".ts", ""),
                description: checker
                    .getSymbolsInScope(
                        originalSourceFile!.endOfFileToken,
                        ts.SymbolFlags.All,
                    )
                    .find((s) => s.name === operationType)!
                    .getDocumentationComment(checker)
                    .map((part) => part.text)
                    .join(""),
                args: args.type.fields,
                type: ret.type,
            });
        }
        if (fileType === "type") {
            const typeName = file.split(path.sep).pop()!.replace(".ts", "");

            const sourceFile = program.getSourceFile(
                `${file}._cobalt_generator_types.ts`,
            );
            if (!sourceFile) continue;

            const symbols = checker.getSymbolsInScope(
                sourceFile!.endOfFileToken,
                ts.SymbolFlags.All,
            );

            const resolverSymbol = symbols.find((s) => s.name === "FIELDS")!;
            const resolverType =
                checker.getDeclaredTypeOfSymbol(resolverSymbol);
            const resolverMeta = gatherMetaForType(
                "",
                { type: resolverType, symbol: resolverSymbol },
                { checker, sourceFile },
                collector,
                collectRenamedTypes,
                [`${typeName}:`],
            );

            collector.removeType("FIELDS");
            collector.removeType("FIELDS!");

            const typeMeta = collector.getType(typeName);

            if (!typeMeta) {
                throw new Error(
                    `Could not find '${typeName}' in collector. Only types can be extended, that were annotated using an 'export const __typename = ....' statement in the operation.`,
                );
            } else if (!typeMeta.isObject) {
                throw new Error(
                    `Right now only ObjectTypes can be extended. '${typeName}' is: isScalar=${typeMeta.isScalar}, isEnum=${typeMeta.isEnum}, isUnion=${typeMeta.isUnion}.`,
                );
            }

            const args = resolverMeta.fields.find((f) => f.name === "args")!;
            const rets = resolverMeta.fields.find((f) => f.name === "returns")!;

            for (const field of rets.type.fields) {
                const fieldName = field.name;

                const argsForField = args.type.inputFields.find(
                    (f) => f.name === fieldName,
                )?.type?.fields;

                if (argsForField?.length) {
                    field.args = argsForField.map((af) => ({
                        name: af.name,
                        description: af.description,
                        type: af.type,
                        index: af.index,
                    }));
                }

                typeMeta.fields.push(field);
            }

            collector.removeType(args.type.name);
            collector.removeType(rets.type.name);

            meta.extendedTypes.push(typeMeta);
        }
    }

    // ======= post-processing =======
    const makeFriendlyNameWithArray = (
        isList: number,
        name: string,
        nameIsWithoutListBrackets: boolean = false,
    ) => {
        const friendlyNameWithoutListBrackets = nameIsWithoutListBrackets
            ? name
            : makeProtocolFriendlyName(
                  isList ? name.slice(isList, -isList) : name,
                  collectRenamedTypes,
              );
        return `${Array(isList)
            .fill("[")
            .join("")}${friendlyNameWithoutListBrackets}${Array(isList)
            .fill("]")
            .join("")}`;
    };

    for (const [typeName, references] of collector.typeReferences.entries()) {
        const type = collector.getType(typeName);
        if (!type) continue;

        if (type.isUnion) {
            type.scalarTSType = type.possibleTypes
                .map((t) =>
                    t.tsType!.aliasSymbol
                        ? `${makeProtocolFriendlyName(
                              t.name,
                              collectRenamedTypes,
                              ["[", "]"],
                          ).replaceAll(
                              /\[|\]/g,
                              "",
                          )}${Array(t.isList).fill("[]").join("")}`
                        : t.tsTypeName,
                )
                .join(" | ");
        } else if (type.isScalar) {
            type.scalarTSType = type.tsTypeName;
        } else if (type.isEnum && type.enumValues.length === 1) {
            type.scalarTSType = type.enumValues[0].type.tsTypeName;
        } else {
            type.scalarTSType = type.tsType!.aliasSymbol
                ? makeProtocolFriendlyName(
                      type.tsTypeName!,
                      collectRenamedTypes,
                  )
                : type.tsTypeName;
        }

        let countReferences = references.length;
        let parentType = type.parentType;
        const pathToRoot = [];
        while (parentType) {
            pathToRoot.push(parentType.name);
            const parentTypeReferences = collector.typeReferences.get(
                parentType.name,
            );
            if (parentTypeReferences) {
                countReferences += parentTypeReferences.length;
            }
            parentType = parentType.parentType;
        }

        const isNotReusedType = countReferences === 1;
        let name: string;
        if (
            isNotReusedType &&
            !type.isScalar &&
            pathToRoot.length <= 2 &&
            false // the renaming causes strange behavior in some cases, it results in many types having the same name
            // maybe because there's a union or so
        ) {
            const makeNameFromReference = (reference: string) => {
                const [operationType, filePathAndTypePath] =
                    reference.split("::");
                const [filePath, typePathStr] = filePathAndTypePath.split(":.");
                const typePath = typePathStr.split(".");
                const resolverName = filePath.split("/").pop()!;
                return `${resolverName}${typePath
                    .slice(0, 2)
                    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                    .join("")}`;
            };

            // const fromArgs = makeNameFromReference(
            //     references.find((r) => r.includes(":.args"))!
            // );
            // const fromReturn = makeNameFromReference(
            //     references.find((r) => r.includes(":.return"))!
            // );

            name = makeFriendlyNameWithArray(
                type.isList,
                makeNameFromReference(references[0]),
                true,
            );
        } else {
            name = typeName;
        }

        type.name = collectRenamedTypes.get(typeName) ?? name;

        meta.types.push(type);
    }

    for (const [typeName, typeMeta] of collector.types.entries()) {
        if (typeMeta.isEnum && typeMeta.enumValues.length === 1) {
            typeMeta.name = `Constant_${typeMeta.enumValues[0].name}`;
        } else if (typeMeta.isUnion) {
            typeMeta.name = `${typeMeta.possibleTypes
                .map((t) => t.name.replaceAll("!", ""))
                .join("Or")}`;
        }

        typeMeta.name = makeFriendlyNameWithArray(
            typeMeta.isList,
            typeMeta.name,
        );
    }

    const typeNames = new Set(meta.types.map((t) => t.name));
    // rename types in scalarTSType to match with the renamed types
    for (const type of meta.types) {
        for (const [
            originalTypeName,
            renamedTypeName,
        ] of collectRenamedTypes.entries()) {
            if (
                type.scalarTSType?.includes(originalTypeName) &&
                !typeNames.has(originalTypeName)
            ) {
                let replaced = type.scalarTSType!.replaceAll(
                    originalTypeName,
                    `${renamedTypeName}${type.isInput ? "Input" : ""}`,
                );
                type.scalarTSType = replaced;
            }
        }
    }
    // ======= post-processing =======

    return meta;
};

const renameToProtocolFriendlyName = (
    name: string,
    ignoreChars: string[] = [],
) => {
    if (name.matchAll(/import\([^)]*\)\./g).toArray().length > 0) {
        name = name.replaceAll(/import\([^)]*\)\./g, "");
    }
    // remove all ! indicating non-null
    // name = name.replaceAll("!", "");

    const replaceChars = [
        '"',
        "-",
        ".",
        " ",
        "<",
        ">",
        "(",
        "{",
        "}",
        ")",
        "[",
        "]",
        "|",
        ":",
        ",",
        "=",
        "?",
        "&",
        "*",
        "$",
        "~",
        "`",
        "'",
        ";",
        "/",
    ].filter((c) => !ignoreChars.includes(c));
    const regex = new RegExp(
        `${replaceChars.map((c) => `\\${c}`).join("|")}`,
        "g",
    );
    let renamedName = name.replace(regex, "_");
    while (renamedName.includes("__")) {
        renamedName = renamedName.replace("__", "_");
    }
    return renamedName;
};

const makeProtocolFriendlyName = (
    name: string,
    collectRenamedTypes: Map<string, string>,
    ignoreChars: string[] = [],
) => {
    if (collectRenamedTypes.has(name)) {
        return collectRenamedTypes.get(name)!;
    }
    const renamedName = renameToProtocolFriendlyName(name, ignoreChars);
    collectRenamedTypes.set(name, renamedName);
    return renamedName;
};

const makeIdentifyingTypeName = (
    program: { checker: ts.TypeChecker; sourceFile: ts.SourceFile },
    tsTypeAndSymbol: { type: ts.Type; symbol?: ts.Symbol },
    override: { isInput?: boolean; isNonNull?: boolean },
    collectRenamedTypes: Map<string, string>,
): { typeName: string; identifyingTypeName: string } => {
    const { type: tsType, symbol } = tsTypeAndSymbol;

    let typeName: string;
    if (
        ("intrinsicName" in tsType && tsType.intrinsicName === "boolean") ||
        (tsType.isUnion() &&
            tsType.types.every(
                (t) =>
                    "intrinsicName" in t &&
                    ["false", "true"].includes(t.intrinsicName as string),
            ))
    ) {
        typeName = "boolean";
    } else {
        typeName = program.checker.typeToString(
            tsType,
            program.sourceFile,
            ts.TypeFormatFlags.NoTruncation,
        );
    }

    const isInput = override.isInput ?? false;
    const isNonNull = override.isNonNull;

    // if the type is a primitive type, we don't need to add any suffixes
    if (["string", "number", "boolean", "true", "false"].includes(typeName)) {
        const finalName = isNonNull ? `${typeName}!` : typeName;
        return {
            typeName: finalName,
            identifyingTypeName: finalName,
        };
    }

    if (isNonNull) {
        typeName = `${typeName}!`;
    }

    let identifyingTypeName = `${typeName.slice(
        0,
        isInput && isNonNull ? -1 : undefined,
    )}${isInput ? `${isNonNull ? "Input!" : "Input"}` : ""}`;

    identifyingTypeName = makeProtocolFriendlyName(
        identifyingTypeName,
        collectRenamedTypes,
        ["[", "]"],
    );

    // if (isNonNull) {
    //     identifyingTypeName = `${identifyingTypeName}!`;
    // }

    return {
        typeName,
        identifyingTypeName,
    };
};

export const gatherMetaForType = (
    name: string,
    tsTypeAndSymbol: {
        type: ts.Type;
        symbol?: ts.Symbol;
    },
    program: { checker: ts.TypeChecker; sourceFile: ts.SourceFile },
    collector: Collector,
    collectRenamedTypes: Map<string, string>,
    path: string[],
    parentType?: TypeMeta,
): TypeMeta => {
    const { type: _tsType, symbol } = tsTypeAndSymbol;

    let tsType = _tsType;
    const declaration =
        symbol?.valueDeclaration ??
        (symbol?.declarations && symbol?.declarations[0]) ??
        // some properties are not declared, but are inferred from the type (<- this is cursor's idea why that is)
        // but anyways, it is how it is: sometime theres [NodeObject] in declarations and there is no valueDeclaration
        // so we can get the valueDeclaration from the symbol of the NodeObject in declarations[0]
        (symbol?.declarations?.[0] as unknown as ts.Type)?.symbol
            ?.valueDeclaration;
    let overrideIsNonNull = undefined;
    if (_tsType.isUnion()) {
        _tsType.types = _tsType.types.filter((t) => {
            const isNullOrUndefined =
                (t.flags & ts.TypeFlags.Null) !== 0 ||
                (t.flags & ts.TypeFlags.Undefined) !== 0;
            if (isNullOrUndefined) {
                overrideIsNonNull = false;
                return false;
            }
            return true;
        });
        if (_tsType.types.length === 1) {
            tsType = _tsType.types[0];
        }
    }
    if (
        declaration &&
        "questionToken" in declaration &&
        declaration.questionToken
    ) {
        overrideIsNonNull = false;
    }

    let meta: TypeMeta = {
        name,

        description: symbol
            ? symbol
                  .getDocumentationComment(program.checker)
                  .map((part) => part.text)
                  .join("")
            : undefined,

        isObject: false,
        fields: [],

        isUnion: false,
        possibleTypes: [],

        isTuple: false,
        isList: 0,
        isNonNull:
            overrideIsNonNull ??
            (!((tsType.flags & ts.TypeFlags.Undefined) !== 0) &&
                !((tsType.flags & ts.TypeFlags.Null) !== 0)) ??
            (symbol ? !((symbol.flags & ts.SymbolFlags.Optional) !== 0) : true),

        isScalar: false,
        scalarTSType: undefined,

        isEnum: false,

        enumValues: [],

        isInput: path.at(1) === "args",

        inputFields: [],

        ofType: undefined,
        parentType,

        tsType,
        tsTypeName: "",
    };

    const { identifyingTypeName, typeName } = makeIdentifyingTypeName(
        program,
        { type: tsType, symbol },
        {
            isInput: meta.isInput,
            isNonNull: meta.isNonNull,
        },
        collectRenamedTypes,
    );
    meta.tsTypeName =
        meta.isNonNull && typeName.endsWith("!")
            ? typeName.slice(0, -1)
            : typeName;

    collector.addTypeReference(identifyingTypeName, path.join("."));

    // Handle already processed types
    if (collector.hasType(identifyingTypeName)) {
        return collector.getType(identifyingTypeName);
    } else {
        meta.name = identifyingTypeName;
        collector.addType(meta);
    }

    meta.ofType = meta;

    // Handle different type kinds
    if (program.checker.isArrayType(tsType)) {
        // Resolve array element type
        const elementType = (tsType as ts.TypeReference).typeArguments?.[0];
        if (elementType) {
            // the name added up until now can in no way be the final name, because
            // it will either be something not existing and having it in the collector
            // will prevent it from being collected in the next step
            // or it will not reflect the final name anyways because we will add the
            // array brackets to the name
            collector.removeType(identifyingTypeName);
            collector.removeTypeReference(identifyingTypeName, path.join("."));

            meta.isList++;
            const arraymeta = gatherMetaForType(
                [...path].join("."),
                { type: elementType, symbol: elementType.symbol },
                program,
                collector,
                collectRenamedTypes,
                [...path],
            );
            const depth = (meta.isList += arraymeta?.isList ?? 0);
            const newmeta = {
                ...arraymeta,
                isList: depth,
                name: `[${arraymeta.name}]`,
                tsTypeName: `${arraymeta.tsTypeName}[]`,
            };
            newmeta.ofType = {
                ...arraymeta,
            };
            meta = newmeta;

            collector.addTypeReference(meta.name, path.join("."));
        }
    } else if (
        tsType.isUnion() &&
        !("intrinsicName" in tsType && tsType.intrinsicName === "boolean") &&
        !tsType.types.every(
            (t) =>
                "intrinsicName" in t &&
                ["false", "true"].includes(t.intrinsicName as string),
        )
    ) {
        meta.isUnion = true;

        if (tsType.types.every((t) => t.isStringLiteral())) {
            meta.isEnum = true;
            meta.enumValues = tsType.types.map((t) => {
                const literalMetaPath = [
                    ...path,
                    t.aliasSymbol?.escapedName ?? t.symbol?.name,
                ].filter(Boolean) as string[];

                const literalMeta = gatherMetaForType(
                    literalMetaPath.join("."),
                    { type: t, symbol: t.symbol },
                    program,
                    collector,
                    collectRenamedTypes,
                    literalMetaPath,
                    meta,
                );
                collector.removeType(literalMeta.name);
                collector.removeTypeReference(
                    literalMeta.name,
                    literalMetaPath.join("."),
                );

                return {
                    name: JSON.parse(literalMeta.tsTypeName!),
                    description: `The value of the string literal ${literalMeta.tsTypeName}`,
                    type: literalMeta,
                };
            });

            meta.isUnion = false;
            meta.possibleTypes = [];
        } else {
            tsType.types.forEach((t) => {
                const unionMeta = gatherMetaForType(
                    [
                        ...path,
                        t.aliasSymbol?.escapedName ?? t.symbol?.name,
                    ].join("."),
                    { type: t, symbol: t.symbol },
                    program,
                    collector,
                    collectRenamedTypes,
                    [
                        ...path,
                        t.aliasSymbol?.escapedName ?? t.symbol?.name,
                    ].filter(Boolean) as string[],
                    meta,
                );
                meta.possibleTypes.push(unionMeta);
            });
            if (tsType.types.length === 1) {
                collector.removeType(identifyingTypeName);

                const singleTypeNameArr = [
                    ...path,
                    tsType.types[0].aliasSymbol?.escapedName ??
                        tsType.types[0].symbol?.name,
                ];
                collector.removeTypeReference(
                    identifyingTypeName,
                    singleTypeNameArr.join("."),
                );

                const singleType = gatherMetaForType(
                    singleTypeNameArr.join("."),
                    {
                        type: tsType.types[0],
                        symbol: tsType.types[0].symbol,
                    },
                    program,
                    collector,
                    collectRenamedTypes,
                    singleTypeNameArr.filter(Boolean),
                );

                meta.name = singleType.name;
                meta.tsType = singleType.tsType;
                meta.isUnion = false;
                meta.possibleTypes = [];

                collector.addTypeReference(
                    meta.name,
                    singleTypeNameArr.join("."),
                );
            }
        }
    } else if (tsType.isIntersection()) {
        // Resolve intersection type members
        tsType.types.forEach((t) => {
            gatherMetaForType(
                [...path, t.aliasSymbol?.escapedName ?? t.symbol?.name].join(
                    ".",
                ),
                { type: t, symbol: t.symbol },
                program,
                collector,
                collectRenamedTypes,
                [...path, t.aliasSymbol?.escapedName ?? t.symbol?.name].filter(
                    Boolean,
                ) as string[],
                meta,
            );
        });
    } else if (tsType.isClassOrInterface()) {
        // Handle type arguments if it's a generic type
        if ((tsType as unknown as ts.TypeReference).typeArguments) {
            (tsType as unknown as ts.TypeReference).typeArguments?.forEach(
                (t) => {
                    gatherMetaForType(
                        [
                            ...path,
                            t.aliasSymbol?.escapedName ?? t.symbol?.name,
                        ].join("."),
                        { type: t, symbol: t.symbol },
                        program,
                        collector,
                        collectRenamedTypes,
                        [
                            ...path,
                            t.aliasSymbol?.escapedName ?? t.symbol?.name,
                        ].filter(Boolean) as string[],
                        meta,
                    );
                },
            );
        }
    } else if (program.checker.isTupleType(tsType)) {
        // Handle tuple types
        const tupleType = tsType as ts.TupleType;
        const tupleTypeTarget = tupleType.target as ts.TupleType;
        tupleType.typeArguments?.forEach((t, i) => {
            let tupleMeta = gatherMetaForType(
                [...path, i.toString()].join("."),
                { type: t, symbol: t.symbol },
                program,
                collector,
                collectRenamedTypes,
                [...path, i.toString()].filter(Boolean) as string[],
                meta,
            );

            if ("labeledElementDeclarations" in tupleTypeTarget) {
                const isOptional =
                    !!tupleTypeTarget.labeledElementDeclarations![i]!
                        .questionToken;

                if (isOptional && tupleMeta.isNonNull) {
                    tupleMeta = {
                        ...tupleMeta,
                        name: tupleMeta.name.slice(0, -1),
                        isNonNull: false,
                    };
                }

                meta.fields.push({
                    name: tupleTypeTarget.labeledElementDeclarations![
                        i
                    ]!.name.getText(),
                    index: i,
                    description: t.symbol
                        ?.getDocumentationComment(program.checker)
                        .map((part) => part.text)
                        .join(""),
                    type: tupleMeta,
                });
            }
        });
        meta.isTuple = true;
    } else if ((tsType.flags & ts.TypeFlags.Object) !== 0) {
        // Handle object type properties
        meta.isObject = !meta.isInput;
        const fields: FieldMeta[] = [];

        // Get properties including those from base types
        const properties = tsType.getProperties();
        properties.forEach((prop) => {
            // Get the type of the property
            const declaration =
                prop.valueDeclaration ??
                (prop.declarations && prop.declarations[0]) ??
                // some properties are not declared, but are inferred from the type (<- this is cursor's idea why that is)
                // but anyways, it is how it is: sometime theres [NodeObject] in declarations and there is no valueDeclaration
                // so we can get the valueDeclaration from the symbol of the NodeObject in declarations[0]
                (prop.declarations?.[0] as unknown as ts.Type)?.symbol
                    ?.valueDeclaration;

            let propType: ts.Type;
            if (!declaration) {
                if (
                    "links" in prop &&
                    "type" in (prop as any).links &&
                    (prop as any).links.type
                ) {
                    propType = program.checker.getTypeOfSymbol(prop);
                } else {
                    console.warn(
                        `No declaration found for property ${prop.name}`,
                    );
                    return;
                }
            } else {
                propType = program.checker.getTypeOfSymbolAtLocation(
                    prop,
                    declaration!,
                );
            }

            fields.push(
                gatherMetaForField(
                    prop.name,
                    { type: propType, symbol: prop },
                    program,
                    collector,
                    collectRenamedTypes,
                    [...path, prop.name],
                    meta,
                ),
            );

            // If it's a method, also process parameter types and return type
            if (prop.flags & ts.SymbolFlags.Method) {
                const signatures = program.checker.getSignaturesOfType(
                    propType,
                    ts.SignatureKind.Call,
                );
                signatures.forEach((sig) => {
                    // Process return type
                    const returnType =
                        program.checker.getReturnTypeOfSignature(sig);
                    gatherMetaForType(
                        [...path, prop.name].join("."),
                        {
                            type: returnType,
                            symbol: sig.declaration
                                ? program.checker.getSymbolAtLocation(
                                      sig.declaration,
                                  )
                                : undefined,
                        },
                        program,
                        collector,
                        collectRenamedTypes,
                        [...path, prop.name],
                        meta,
                    );

                    // Process parameter types
                    sig.parameters.forEach((param) => {
                        const paramType =
                            program.checker.getTypeOfSymbol(param);
                        gatherMetaForType(
                            [...path, prop.name, param.name].join("."),
                            {
                                type: paramType,
                                symbol: param,
                            },
                            program,
                            collector,
                            collectRenamedTypes,
                            [...path, prop.name],
                            meta,
                        );
                    });

                    // Process type parameters if any
                    sig.typeParameters?.forEach((typeParam) => {
                        gatherMetaForType(
                            [...path, prop.name].join("."),
                            {
                                type: typeParam,
                                symbol: typeParam.symbol,
                            },
                            program,
                            collector,
                            collectRenamedTypes,
                            [...path, prop.name],
                            meta,
                        );
                    });
                });
            }
        });

        if (meta.isInput) {
            meta.inputFields = fields;
        } else {
            meta.fields = fields;
        }

        // Handle index signatures if any
        const numberIndexType = program.checker.getIndexTypeOfType(
            tsType,
            ts.IndexKind.Number,
        );
        if (numberIndexType) {
            gatherMetaForType(
                [...path, "[number]"].join("."),
                {
                    type: numberIndexType,
                    symbol: numberIndexType.symbol,
                },
                program,
                collector,
                collectRenamedTypes,
                [...path, "[number]"],
                meta,
            );
        }

        const stringIndexType = program.checker.getIndexTypeOfType(
            tsType,
            ts.IndexKind.String,
        );
        if (stringIndexType) {
            gatherMetaForType(
                [...path, "[string]"].join("."),
                {
                    type: stringIndexType,
                    symbol: stringIndexType.symbol,
                },
                program,
                collector,
                collectRenamedTypes,
                [...path, "[string]"],
                meta,
            );
        }

        // Handle call signatures if any
        const callSignatures = tsType.getCallSignatures();
        callSignatures.forEach((sig) => {
            const returnType = program.checker.getReturnTypeOfSignature(sig);
            gatherMetaForType(
                [...path, "(call)"].join("."),
                {
                    type: returnType,
                    symbol: sig.declaration
                        ? program.checker.getSymbolAtLocation(sig.declaration)
                        : undefined,
                },
                program,
                collector,
                collectRenamedTypes,
                [...path, "(call)"],
                meta,
            );

            sig.parameters.forEach((param) => {
                const paramType = program.checker.getTypeOfSymbol(param);
                gatherMetaForType(
                    [...path, "(call)", param.name].join("."),
                    {
                        type: paramType,
                        symbol: param,
                    },
                    program,
                    collector,
                    collectRenamedTypes,
                    [...path, "(call)", param.name],
                    meta,
                );
            });
        });

        // Handle construct signatures if any
        const constructSignatures = tsType.getConstructSignatures();
        constructSignatures.forEach((sig) => {
            const returnType = program.checker.getReturnTypeOfSignature(sig);
            gatherMetaForType(
                [...path, "(construct)"].join("."),
                {
                    type: returnType,
                    symbol: sig.declaration
                        ? program.checker.getSymbolAtLocation(sig.declaration)
                        : undefined,
                },
                program,
                collector,
                collectRenamedTypes,
                [...path, "(construct)"],
                meta,
            );

            sig.parameters.forEach((param) => {
                const paramType = program.checker.getTypeOfSymbol(param);
                gatherMetaForType(
                    [...path, "(construct)", param.name].join("."),
                    {
                        type: paramType,
                        symbol: param,
                    },
                    program,
                    collector,
                    collectRenamedTypes,
                    [...path, "(construct)", param.name],
                    meta,
                );
            });
        });
    } else if (tsType.isStringLiteral()) {
        meta.isEnum = true;
        meta.enumValues = [
            {
                name: JSON.parse(meta.tsTypeName),
                description: `The value of the string literal ${meta.tsTypeName}`,
                type: meta,
            },
        ];
    }

    meta.isScalar =
        !meta.isObject && !meta.isUnion && !meta.isEnum && !meta.isTuple;

    if (meta.isScalar && meta.inputFields.length > 0) {
        meta.isScalar = false;
    } else if (
        meta.isScalar ||
        meta.isObject ||
        // meta.isUnion || // keep this for now, because it's used for custom scalars
        meta.isEnum ||
        meta.isTuple
    ) {
        meta.isInput = false;
    }

    collector.addType(meta);

    return meta;
};

export const gatherMetaForField = (
    name: string,
    fieldTypeAndSymbol: {
        type: ts.Type;
        symbol?: ts.Symbol;
    },
    program: { checker: ts.TypeChecker; sourceFile: ts.SourceFile },
    collector: Collector,
    collectRenamedTypes: Map<string, string>,
    path: string[],
    parentType?: TypeMeta,
): FieldMeta => {
    const { type: fieldType } = fieldTypeAndSymbol;
    return {
        name,
        description: (fieldType.aliasSymbol ?? fieldType.symbol)
            ?.getDocumentationComment(program.checker)
            .map((part) => part.text)
            .join(""),
        type: gatherMetaForType(
            name,
            fieldTypeAndSymbol,
            program,
            collector,
            collectRenamedTypes,
            path,
            parentType,
        ),
    };
};
