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

        if (!type.scalarTSType) {
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
                !type.scalarTSTypeIsFinal &&
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
    const importsRegex = new RegExp(/import\([^)]*\)\./g);

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

    if (!name.match(regex) && !name.match(importsRegex)) return undefined;

    if (name.matchAll(importsRegex).toArray().length > 0) {
        name = name.replaceAll(importsRegex, "");
    }

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

    let renamedName = renameToProtocolFriendlyName(name, ignoreChars);
    if (renamedName) {
        // If there are types that have import references, it means that the same type (by name)
        // exists in different locations, that's why typescript adds the import(...).Type prefix.
        // In such cases we need to keep them distinct, so we don't override them with each other
        let idx = 0;
        let otherNamesWithSameRenamed: [name: string, renamed: string][] = [];
        while (
            // we only do this duplicate-renaming if the current name (which is being renamed)
            // includes the import statement. Otherwise it might also be a type that results
            // in the same renamed type if there're for example the same types one time as array
            // and one time without it, or as object literal. the '[' and '{' both become '_'
            // and we might get false duplicates
            name.match(/import\([^)]*\)\./g) &&
            (otherNamesWithSameRenamed = collectRenamedTypes
                .entries()
                .filter(([n, rn]) => rn === renamedName)
                .toArray())?.length
        ) {
            const dupNumber: number = renamedName.match(/_Duplicate(\d+)_/)?.[1]
                ? parseInt(renamedName.match(/_Duplicate(\d+)_/)?.[1]!)
                : 0;

            if (dupNumber) {
                idx = dupNumber + 1;
                renamedName = renamedName.replace(
                    `_Duplicate${dupNumber}_`,
                    `_Duplicate${idx}_`,
                );
            } else {
                renamedName = `_Duplicate${++idx}_${renamedName}`;
            }
        }

        collectRenamedTypes.set(name, renamedName);
        return renamedName;
    }
    return name;
};

const makeIdentifyingTypeName = (
    program: { checker: ts.TypeChecker; sourceFile: ts.SourceFile },
    tsTypeAndSymbol: { type: ts.Type; symbol?: ts.Symbol },
    override: {
        isInput?: boolean;
        isNonNull?: boolean;
        removeUndefinedFromTypeNameBcItComesFromOptional?: boolean;
    },
    collectRenamedTypes: Map<string, string>,
): {
    typeName: string;
    identifyingTypeName: string;
    finalScalarTSType?: string;
} => {
    const { type: tsType, symbol } = tsTypeAndSymbol;

    let typeName: string;
    let finalScalarTSType: string | undefined = undefined;
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

        if (typeName === "any") {
            typeName = "Record<string | number | symbol, unknown>";
            finalScalarTSType = typeName;
        }
        if (typeName === "object") {
            typeName = "Record<string, any>";
            finalScalarTSType = typeName;
        }
    }

    if (
        override.removeUndefinedFromTypeNameBcItComesFromOptional &&
        (typeName.includes(" | undefined") || typeName.includes(" | null"))
    ) {
        typeName = typeName.replaceAll(" | undefined", "");
        typeName = typeName.replaceAll(" | null", "");
    }

    const isInput = override.isInput ?? false;
    const isNonNull = override.isNonNull;

    // if the type is a primitive type, we don't need to add any suffixes
    if (["string", "number", "boolean", "true", "false"].includes(typeName)) {
        const finalName = isNonNull ? `${typeName}!` : typeName;
        return {
            typeName: finalName,
            identifyingTypeName: finalName,
            finalScalarTSType,
        };
    }

    // let identifyingTypeName = typeName;

    // if (isInput) {
    //     identifyingTypeName = `${typeName}Input`;
    // }

    // if (isNonNull) {
    //     identifyingTypeName = `${identifyingTypeName}!`;
    // }
    // // else {
    // //     identifyingTypeName = `${identifyingTypeName}Nullable`;
    // // }

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
        finalScalarTSType,
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

    let removeUndefinedFromTypeNameBcItComesFromOptional = false;
    if (
        declaration &&
        "questionToken" in declaration &&
        declaration.questionToken
    ) {
        overrideIsNonNull = false;
        removeUndefinedFromTypeNameBcItComesFromOptional = true;
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
        scalarTSTypeIsFinal: false,

        isEnum: false,

        enumValues: [],

        isInput: path.at(1) === "args",

        inputFields: [],

        ofType: undefined,
        parentType,

        tsType,
        tsTypeName: "",
    };

    const { identifyingTypeName, typeName, finalScalarTSType } =
        makeIdentifyingTypeName(
            program,
            { type: tsType, symbol },
            {
                isInput: meta.isInput,
                isNonNull: meta.isNonNull,
                removeUndefinedFromTypeNameBcItComesFromOptional,
            },
            collectRenamedTypes,
        );
    meta.tsTypeName =
        meta.isNonNull && typeName.endsWith("!")
            ? typeName.slice(0, -1)
            : typeName;

    if (finalScalarTSType) {
        meta.scalarTSType = finalScalarTSType;
        meta.scalarTSTypeIsFinal = true;
    }

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
                name: `${Array(depth).fill("[").join("")}${arraymeta.name.replaceAll("[", "").replaceAll("]", "")}${Array(depth).fill("]").join("")}`,
                tsTypeName: `${arraymeta.tsTypeName?.replaceAll("[]", "")}${Array(depth).fill("[]").join("")}`,
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

        if (
            tsType.types.some((t) => t.isStringLiteral()) ||
            tsType.types.some((t) => t.isNumberLiteral())
        ) {
            meta.isEnum = true;
            let enumValues: {
                name: string;
                description: string;
                type: TypeMeta;
            }[] = [];

            for (const t of tsType.types) {
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

                let name = (literalMeta.tsType! as ts.StringLiteralType).value;

                if (!isNaN(parseFloat(name))) {
                    // if one string literal is a number, let's use a custom scalar instead
                    // because enum member names cannot start with a digit and we would break
                    // the enum value if we prefix it with an underscore or such
                    enumValues = [];
                    meta.isEnum = false;

                    meta.isScalar = true;
                    meta.scalarTSType = tsType.types
                        .map((_t) =>
                            _t.isStringLiteral()
                                ? `"${_t.value}"`
                                : _t.isNumberLiteral()
                                  ? _t.value
                                  : () => {
                                        const unionMeta = gatherMetaForType(
                                            [
                                                ...path,
                                                t.aliasSymbol?.escapedName ??
                                                    t.symbol?.name,
                                            ].join("."),
                                            { type: t, symbol: t.symbol },
                                            program,
                                            collector,
                                            collectRenamedTypes,
                                            [
                                                ...path,
                                                t.aliasSymbol?.escapedName ??
                                                    t.symbol?.name,
                                            ].filter(Boolean) as string[],
                                            meta,
                                        );

                                        return unionMeta.tsTypeName;
                                    },
                        )
                        .filter(Boolean)
                        .join(" | ");
                    meta.scalarTSTypeIsFinal = true;

                    break;
                }

                let description = `The value of the string literal ${literalMeta.tsTypeName}`;

                // check if the union type comes from using an enum
                // if so, we need to check if the key === value
                // because if it doesn't, not only have to take the value
                // as enum-member in graphql but also note the key name
                // so that we can recreate the enum in samarium's typegen
                if (t.symbol && "parent" in t.symbol) {
                    const parentEnum = (t.symbol as any).parent as ts.Symbol;

                    if (parentEnum && parentEnum.exports) {
                        const [exportName, exportVal] =
                            parentEnum.exports
                                .entries()
                                .find(
                                    ([k, v]) => k.toString() === t.symbol.name,
                                ) ?? [];

                        if (
                            exportVal &&
                            exportVal.valueDeclaration?.parent &&
                            "members" in exportVal.valueDeclaration?.parent
                        ) {
                            const members = exportVal.valueDeclaration?.parent
                                .members as any[];

                            const kvPair = members?.find(
                                (a) => a.symbol?.name === exportName,
                            );

                            const keyName = kvPair.symbol?.name;
                            const val = (
                                program.checker.getTypeAtLocation(
                                    kvPair.initializer as ts.Node,
                                ) as ts.StringLiteralType
                            ).value;

                            if (keyName !== val) {
                                // console.log(
                                //     `Enum needs typedef comment, key is different from value: ${keyName} = ${val}`,
                                // );
                                name = val;
                                description = `@property {"${val}"} ${keyName}`;
                            }
                        }
                    }
                }

                enumValues.push({
                    name,
                    description,
                    type: literalMeta,
                });
            }
            meta.enumValues = enumValues;

            meta.isUnion = false;
            meta.possibleTypes = [];
        } else {
            let unionTypeIsList = 0;
            const unionTypes: TypeMeta[] = [];
            let unionTypeNeedsScalar = false;

            for (const t of tsType.types) {
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

                if (unionTypeIsList && unionMeta.isList !== unionTypeIsList) {
                    unionTypeNeedsScalar = true;
                } else if (!unionTypeIsList && unionMeta.isList) {
                    unionTypeIsList = unionMeta.isList;
                }

                unionTypes.push(unionMeta);
            }

            if (unionTypeNeedsScalar) {
                meta.isUnion = false;
                meta.possibleTypes = [];

                meta.isScalar = true;
                meta.scalarTSType = unionTypes.map((t) => t.name).join(" | ");
                meta.scalarTSTypeIsFinal = true;
            } else {
                if (unionTypeIsList) {
                    meta.isList = unionTypeIsList;
                }
                meta.possibleTypes = unionTypes;
            }

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
                    !!tupleTypeTarget.labeledElementDeclarations?.[i]
                        ?.questionToken;

                if (isOptional && tupleMeta.isNonNull) {
                    tupleMeta = {
                        ...tupleMeta,
                        name: tupleMeta.name.slice(0, -1),
                        isNonNull: false,
                    };
                }

                meta.fields.push({
                    name:
                        tupleTypeTarget.labeledElementDeclarations?.[
                            i
                        ]?.name.getText() ?? `_idx_${i}`,
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
                    makeProtocolFriendlyName(prop.name, collectRenamedTypes),
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
        const name = tsType.value;

        meta.isEnum = true;
        meta.enumValues = [
            {
                name,
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
