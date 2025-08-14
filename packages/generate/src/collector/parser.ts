export type ParsedTypeStringMetadata = {
    type: string; // e.g., 'string', 'boolean', 'Hours[]', '{ coordinates: number[]; type?: string; }'
    isOptional: boolean; // true if type includes '| undefined'
    isArray: boolean; // true if type is an array
    canBeUndefined: boolean; // true if type is a union with undefined
};

export function parseTypeString(
    typeString: string,
    prependToKeys?: string,
): Map<string, ParsedTypeStringMetadata> {
    const metadata = new Map<string, ParsedTypeStringMetadata>();
    let index = 0;
    typeString = typeString.trim();

    // only parse object types
    if (!typeString.startsWith("{")) {
        return metadata;
    }

    // Skip leading/trailing union with undefined at root
    if (typeString.endsWith(" | undefined")) {
        typeString = typeString.slice(0, -" | undefined".length).trim();
    }

    // Ensure we're parsing an object type
    if (!typeString.startsWith("{")) {
        throw new Error(
            `Expected object type starting with "{", got: ${typeString.slice(
                0,
                50,
            )}...`,
        );
    }

    function parseObject(path: string[] = []): void {
        index++; // Skip '{'
        skipWhitespace();

        // Helper function to check if a type is an array
        function isTopLevelArray(typeStr: string): boolean {
            // Check if the entire type ends with [] at the top level
            const trimmed = typeStr.trim();
            if (trimmed.endsWith("[]")) {
                return true;
            }

            // Split on top-level | only (not inside braces)
            let depth = 0;
            let parts: string[] = [];
            let current = "";
            for (let i = 0; i < typeStr.length; i++) {
                const c = typeStr[i];
                if (c === "{") depth++;
                if (c === "}") depth--;
                if (c === "|" && depth === 0) {
                    parts.push(current.trim());
                    current = "";
                } else {
                    current += c;
                }
            }
            if (current.trim()) parts.push(current.trim());

            // Check if any part ends with [] or is wrapped in parentheses and ends with []
            const result = parts.some((p) => {
                const trimmed = p.trim();
                const isArray =
                    /\w+\[\](\[\])*$/.test(trimmed) ||
                    /^\(.*\)\[\]$/.test(trimmed) ||
                    /^\{.*\}\[\]$/.test(trimmed);
                return isArray;
            });
            return result;
        }

        while (index < typeString.length && typeString[index] !== "}") {
            // Check if we're at the end of the object
            if (typeString[index] === "}") {
                break;
            }

            // Parse property name
            const propMatch = typeString
                .slice(index)
                .match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:/);
            if (!propMatch) {
                // Check if we're in the middle of a union type or object type
                const nextChar = typeString[index]?.trim();
                if (
                    nextChar &&
                    (nextChar === "|" || nextChar === "{" || nextChar === "}")
                ) {
                    // We're at the end of the object
                    break;
                }
                throw new Error(
                    `Invalid property name at index ${index}: ${typeString.slice(
                        index,
                        index + 50,
                    )}...`,
                );
            }

            // Check if we're in the middle of parsing a complex type
            const beforeMatch = typeString.slice(0, index);
            const lastChar = beforeMatch[beforeMatch.length - 1];
            if (lastChar === "|" || lastChar === "{") {
                // We're in the middle of a union or object, this is not a new property
                break;
            }

            const propName = propMatch[1]!;
            const isOptionalProp = propMatch[0].includes("?");
            index += propMatch[0].length;
            skipWhitespace();

            // After property name and colon, extract the type string for this property
            let typeStart = index;
            let typeEnd = index;
            let braceDepth = 0;
            let parenDepth = 0;
            let bracketDepth = 0;
            let inString = false;
            let stringChar = "";
            while (typeEnd < typeString.length) {
                const c = typeString[typeEnd];
                if (!inString && (c === '"' || c === "'")) {
                    inString = true;
                    stringChar = c;
                } else if (inString && c === stringChar) {
                    inString = false;
                } else if (!inString) {
                    if (c === "{") braceDepth++;
                    if (c === "}") braceDepth--;
                    if (c === "(") parenDepth++;
                    if (c === ")") parenDepth--;
                    if (c === "[") bracketDepth++;
                    if (c === "]") bracketDepth--;

                    // Only break at semicolon if we're at top level
                    if (
                        braceDepth === 0 &&
                        parenDepth === 0 &&
                        bracketDepth === 0 &&
                        c === ";"
                    ) {
                        break;
                    }
                }
                typeEnd++;
            }
            const propTypeString = typeString.slice(typeStart, typeEnd).trim();
            index = typeEnd;
            skipWhitespace();

            let type: string = propTypeString; // Default to the original type string
            let isOptionalType = false;
            let isArray = false;
            let canBeUndefined = false;
            if (propTypeString.startsWith("{")) {
                // Object type, parse recursively
                const innerMeta = parseTypeString(propTypeString);
                // For nested objects, we need to merge the inner metadata with the current path
                // But only if this is a single object, not a union of objects
                // Check if this property type itself is a union (not just contains unions)
                // Check if the object type contains | at the top level
                let braceDepth = 0;
                let hasTopLevelUnion = false;
                for (let i = 0; i < propTypeString.length; i++) {
                    const c = propTypeString[i];
                    if (c === "{") braceDepth++;
                    if (c === "}") braceDepth--;
                    if (c === "|" && braceDepth === 0) {
                        hasTopLevelUnion = true;
                        break;
                    }
                }
                // Only treat as union if it's a union of objects, not if it's a single object with | undefined
                // Also, don't treat as union if the | is inside a nested object
                const isUnionType =
                    hasTopLevelUnion &&
                    !propTypeString.trim().endsWith("| undefined") &&
                    !(
                        propTypeString.startsWith("{") &&
                        propTypeString.endsWith("}")
                    );
                if (!isUnionType) {
                    // Single nested object - create nested property entries
                    for (const [innerPath, innerMetaData] of innerMeta) {
                        if (innerPath === "") {
                            // This is the object itself, not a nested property
                            type = innerMetaData.type;
                            isOptionalType = innerMetaData.isOptional;
                            isArray = innerMetaData.isArray;
                        } else {
                            // Always add nested property entries
                            const fullPath = path
                                .concat([propName, innerPath])
                                .join(".");

                            metadata.set(
                                `${prependToKeys ?? ""}${fullPath}`,
                                innerMetaData,
                            );
                        }
                    }
                    // Always set canBeUndefined for the property based on the outer propTypeString
                    canBeUndefined = /\|\s*undefined\s*$/.test(
                        propTypeString.trim(),
                    );
                } else {
                    // Union of objects - don't create nested entries, just use the type as is
                    type = propTypeString;
                    if (/\|\s*undefined/.test(type)) {
                        canBeUndefined = true;
                    }
                }
                if (!type) {
                    type = propTypeString;
                }
            } else {
                // Not an object type, analyze directly
                if (/\|\s*undefined/.test(type)) {
                    canBeUndefined = true;
                }
                // Optional only if property is marked optional (has ?)
                isOptionalType = false;
                // Array if top-level type or any top-level union member is an array
                isArray = isTopLevelArray(type);
            }

            // Handle '| undefined' after the type (e.g., after nested object)
            skipWhitespace();
            if (
                typeString.slice(index, index + "| undefined".length) ===
                "| undefined"
            ) {
                isOptionalType = true;
                index += "| undefined".length;
                skipWhitespace();
            } else if (
                typeString.slice(index, index + " | undefined".length) ===
                " | undefined"
            ) {
                isOptionalType = true;
                index += " | undefined".length;
                skipWhitespace();
            }
            // Set canBeUndefined if the type string contains '| undefined'
            // Only apply this logic for non-object types, since nested objects handle canBeUndefined differently
            if (
                !propTypeString.startsWith("{") &&
                /\|\s*undefined/.test(type)
            ) {
                canBeUndefined = true;
            }
            // Set isArray only if the top-level type (or any top-level union member) is an array
            isArray = isTopLevelArray(type);
            const fullPath = path.concat([propName]).join(".");
            metadata.set(`${prependToKeys ?? ""}${fullPath}`, {
                type,
                isOptional: isOptionalProp || isOptionalType,
                isArray,
                canBeUndefined: canBeUndefined, // Keep canBeUndefined as is, regardless of optional status
            });

            skipWhitespace();
            // Handle semicolon or end of object
            if (index < typeString.length) {
                if (typeString[index] === ";") {
                    index++; // Skip ';'
                } else if (typeString[index] !== "}") {
                    throw new Error(
                        `Expected ';' or '}' at index ${index}: ${typeString.slice(
                            index,
                            index + 50,
                        )}...`,
                    );
                }
            }
            skipWhitespace();
        }

        if (index < typeString.length && typeString[index] === "}") {
            index++; // Skip '}'
        }
    }

    function skipWhitespace(): void {
        while (
            index < typeString.length &&
            /\s/.test(typeString[index] || "")
        ) {
            index++;
        }
    }

    parseObject();
    return metadata;
}

export function addNewEntriesOnly(
    metadata: Map<string, ParsedTypeStringMetadata>,
    newMetadata: Map<string, ParsedTypeStringMetadata>,
): Map<string, ParsedTypeStringMetadata> {
    const result = new Map<string, ParsedTypeStringMetadata>();
    for (const [key, value] of newMetadata) {
        if (!metadata.has(key)) {
            result.set(key, value);
        } else {
            result.set(key, metadata.get(key)!);
        }
    }
    return result;
}
