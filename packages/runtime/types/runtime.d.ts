type InstanceTypeOrT<T extends abstract new (...args: any) => any> =
    T extends abstract new (...args: any) => infer R ? R : T;

type UnpackPromise<T> = T extends Promise<infer U> ? DeepUnpackPromises<U> : T;
type DeepUnpackPromises<T> = T extends (...args: infer A) => infer R
    ? (...args: A) => UnpackPromise<R>
    : T extends object
      ? { [K in keyof T]: DeepUnpackPromises<T[K]> }
      : T;

type CobaltGlobalObject = {
    __cobalt: {
        auth:
            | {
                  oauth: undefined;
                  cobalt: {
                      oauth: import(".cobalt/auth/oauth").client;
                      sdk: typeof import(".cobalt/auth/sdk").default;
                  };
              }
            | {
                  oauth: string | {};
                  cobalt: undefined;
              };
    };
};
declare type CobaltCtxInput = {
    oauth?: import(".cobalt/auth/oauth").client;
    headers: Headers;
};
declare type CobaltCtxFactory = <CTX extends object>(
    args: CobaltCtxInput,
) => CTX;

declare const $$use: <FuncOrObject>(
    fn: FuncOrObject,
) => DeepUnpackPromises<FuncOrObject>;

declare const $$auth: (that: any) => {
    token: {
        aud: string;
        subject: {
            type: keyof import(".cobalt/auth/oauth").__Subjects__;
            properties: import(".cobalt/auth/oauth").__Subjects__[keyof import(".cobalt/auth/oauth").__Subjects__];
        };
    };
} & Pick<(typeof import(".cobalt/auth/sdk"))["default"], "query" | "mutation">;

declare const $$ctx: (that: any) => {
    $$auth: ReturnType<typeof $$auth>;
} & Awaited<ReturnType<typeof import("$$ctx").default>>;

declare const $$root: {
    [__typename in keyof import("$$types").Types]: (
        that: any,
    ) => import("$$types").Types[__typename];
};
