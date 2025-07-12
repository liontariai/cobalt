export type ParametersOfConstructor<
    T extends abstract new (...args: any) => any,
> = T extends abstract new (...args: infer A) => any ? A : any;

export type Capitalize<S extends string> = S extends `${infer F}${infer R}`
    ? `${Uppercase<F>}${R}`
    : S;
export type UndoCapitalize<S extends string> = S extends `${infer F}${infer R}`
    ? `${Lowercase<F>}${R}`
    : S;
export type GetStrAfter<
    S extends string,
    T extends string,
> = S extends `${infer _}${T}${infer R}` ? R : never;

export type PrismaScalars =
    | "String"
    | "Boolean"
    | "Int"
    | "Float"
    | "DateTime"
    | "Json"
    | "Bytes";
export type PrismaScalarsWithOptional = `${PrismaScalars}?`;
export type PrismaScalarsAsArray = `${PrismaScalars}[]`;
export type PrismaScalarTypes =
    | PrismaScalars
    | PrismaScalarsWithOptional
    | PrismaScalarsAsArray;

export type PrismaScalarTypesWithId = `${PrismaScalarTypes}${"" | " @id"}`;
export type PrismaScalarTypesWithUnique =
    `${PrismaScalarTypes}${"" | " @unique"}`;

type _PrismaFields = PrismaScalarTypesWithId | PrismaScalarTypesWithUnique;

export type PrismaFields = `${_PrismaFields}${"" | ` @default(${string})`}`;
