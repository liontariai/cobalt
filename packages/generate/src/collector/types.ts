export type CodegenOptions = {};

export interface SchemaMeta {
    types: TypeMeta[];
    operations: OperationMeta[];
    customScalars: TypeMeta[];

    extendedTypes: TypeMeta[];
}

export type OperationType = "Query" | "Mutation" | "Subscription";
export interface OperationMeta {
    file: string;
    operation: OperationType;
    name: string;
    description: string | undefined;
    args: ParameterMeta[];
    type: TypeMeta;
}

export interface ParameterMeta {
    name: string;
    description: string | undefined;
    type: TypeMeta;
    index?: number | string;
}

export interface TypeMeta {
    name: string;
    description: string | undefined;

    isTuple: boolean;
    isList: number;
    isNonNull: boolean;
    isScalar: boolean; // type with "format"
    scalarTSType?: string;

    isObject: boolean;
    fields: FieldMeta[];

    isUnion: boolean; // is anyOf / oneOf
    possibleTypes: TypeMeta[];

    isEnum: boolean;
    enumValues: EnumValueMeta[];

    isInput: boolean; // is used in post body somewhere
    inputFields: ParameterMeta[];

    ofType?: TypeMeta;
    parentType?: TypeMeta;

    tsType?: import("typescript").Type;
    tsTypeName?: string;
}

export interface FieldMeta {
    name: string;
    description: string | undefined;
    type: TypeMeta;
    args?: ParameterMeta[];
    index?: number | string;
}

export interface EnumValueMeta {
    name: string;
    description: string | undefined;
    type: TypeMeta;
}
