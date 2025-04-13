import ts from "typescript";
import { createInlineProgram } from "./collector/util";

export const resolveTypeWithSource = <
    const R extends {
        [typeName: string]: string;
    },
>(
    source: string,
    resolveTypes: R,
) => {
    const { program, sourceFile } = createInlineProgram(
        `${source}\n${Object.entries(resolveTypes)
            .map(([key, value]) => `type ${key} = ${value};`)
            .join("\n")}`,
    );
    const checker = program.getTypeChecker();
    const symbols = checker.getSymbolsInScope(
        sourceFile!.endOfFileToken,
        ts.SymbolFlags.All,
    );

    const result: { [typeName in keyof R]: string } = {} as {
        [typeName in keyof R]: string;
    };

    for (const typeName in resolveTypes) {
        const symbol = symbols.find((s) => s.name === typeName)!;
        const type = checker.getDeclaredTypeOfSymbol(symbol);
        result[typeName] = checker.typeToString(
            type,
            sourceFile!,
            ts.TypeFormatFlags.InTypeAlias | ts.TypeFormatFlags.NoTruncation,
        );
    }

    return result;
};
