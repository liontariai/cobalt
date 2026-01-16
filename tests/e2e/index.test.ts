import { describe, beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import { initializeAndCompile } from "../../packages/dev/src/commands/shared";
import { makeGraphQLHandler } from "../../packages/dev/src/util";
import { createHandler } from "graphql-sse/lib/use/fetch";

const makeHandlerFromDir = async (dir: string, options?: { operationFilesGlob?: string; typeFilesGlob?: string }) => {
    let ctxDir: string = dir;
    let tries = 0;
    const searchCtxDirs = [];
    do {
        if (await Bun.file(path.join(ctxDir, "ctx.ts")).exists()) {
            break;
        }
        ctxDir = path.resolve(ctxDir, "..");
        searchCtxDirs.push(ctxDir);
        tries++;
    } while (tries < 10);
    if (!(await Bun.file(path.join(ctxDir, "ctx.ts")).exists())) {
        console.error(`ctx.ts not found in: ${ctxDir}`, `Looked in: ${[dir, ...searchCtxDirs].join("\n\t")}`);
        process.exit(1);
    }

    let { ctxFile, gqlSchema, writeSdkOut, writeSchemaOut, writeTypesOut } = await initializeAndCompile(
        {
            dir: path.join(dir, "operations"),
            port: 4000,
            pretty: true,
            sdkOut: path.join(
                ctxDir,
                ".sdks",
                `${path
                    .join(dir, options?.operationFilesGlob?.replaceAll("/**/", "").replaceAll("*.ts", "") ?? "")
                    .replace("./", "")
                    .replaceAll(path.sep, ".")}.ts`.replaceAll("..", "."),
            ),
            ...options,
            $$typesSymbol: "$$types",
            onFileCollected: async (file, meta, fileType) => {
                const typesDir = path.join(
                    ctxDir,
                    ".types",
                    `${path
                        .join(dir, options?.operationFilesGlob?.replaceAll("/**/", "").replaceAll("*.ts", "") ?? "")
                        .replace("./", "")
                        .replaceAll(path.sep, ".")}.$$types`.replaceAll("..", "."),
                );
                const relativeTypesDir = path.relative(path.dirname(file), typesDir);

                if (
                    ("type" in meta && meta.type.isUnion) ||
                    ("isUnion" in meta &&
                        meta.isUnion &&
                        !meta.isInput &&
                        !meta.possibleTypes.some((pt) => pt.isScalar || pt.isEnum) &&
                        meta.isObject)
                ) {
                    const content = fs.readFileSync(file, "utf-8");
                    let newContent = content;
                    if (!content.includes(`import type { $$types } from`)) {
                        newContent = `import type { $$types } from "${relativeTypesDir}";\n${content}`;
                    }
                    fs.writeFileSync(file, newContent);
                }
            },
        },
        undefined,
        true,
        {
            writeSchemaOut: async (outpath: string, schema: string) => {
                await Bun.write(
                    path.join(
                        ctxDir,
                        ".schemas",
                        `${path
                            .join(dir, options?.operationFilesGlob?.replaceAll("/**/", "").replaceAll("*.ts", "") ?? "")
                            .replace("./", "")
                            .replaceAll(path.sep, ".")}.graphql`.replaceAll("..", "."),
                    ),
                    schema,
                );
                return outpath;
            },
            writeResolversOut: async (outpath: string, entrypoint: string) => {
                const outfile = path.join(
                    ctxDir,
                    ".resolvers",
                    `${path
                        .join(dir, options?.operationFilesGlob?.replaceAll("/**/", "").replaceAll("*.ts", "") ?? "")
                        .replace("./", "")
                        .replaceAll(path.sep, ".")}.resolvers.ts`.replaceAll("..", "."),
                );
                await Bun.write(
                    Bun.file(outfile),
                    entrypoint.replace('"@cobalt27/runtime"', `"${Bun.resolveSync("@cobalt27/runtime", process.cwd())}"`),
                );
                return outfile;
            },
            writeTypesOut: async (outpath: string, tsTypes: Record<string, string>) => {
                const basePath = path.join(
                    ctxDir,
                    ".types",
                    `${path
                        .join(dir, options?.operationFilesGlob?.replaceAll("/**/", "").replaceAll("*.ts", "") ?? "")
                        .replace("./", "")
                        .replaceAll(path.sep, ".")}.$$types`.replaceAll("..", "."),
                );

                for (const [fname, _fcontent] of Object.entries(tsTypes)) {
                    let fcontent = _fcontent;
                    if (fname === "index") {
                        fcontent = `export namespace $$types { ${_fcontent} }`;
                    }
                    await Bun.write(Bun.file(path.join(basePath, `${fname}.ts`)), fcontent);
                }
                return basePath;
            },
        },
    );
    const ctx = require(ctxFile).default as CobaltCtxFactory;
    const ctxFactory = async (req: Request): Promise<any> => ({
        headers: req.headers,
        ...(await ctx({
            headers: req.headers as any,
        })),
    });
    const graphqlHandler = makeGraphQLHandler(gqlSchema, ctxFactory as any);
    const sse = createHandler({ schema: gqlSchema, context: ctxFactory as any });

    await writeSdkOut();
    await writeSchemaOut();
    await writeTypesOut();

    const configureSdkWithHandler = async (sdk: any) => {
        if (!sdk?.init) return sdk;
        sdk.init({
            fetcher: async (init: string | URL | Request, options?: RequestInit) => {
                if (!new Headers(options?.headers)?.get("accept")?.includes("text/event-stream")) {
                    return await graphqlHandler(new Request(init as string, options));
                }
                return await sse(new Request(init as string, options));
            },
            sseFetchTransform: async (input: string, init: RequestInit) => {
                return [input, init];
            },
        });
        return sdk;
    };

    return configureSdkWithHandler;
};

describe("E2E", () => {
    beforeAll(async () => {
        // Optionally: start server or prepare environment if needed
    });

    afterAll(async () => {
        // Optionally: cleanup resources
    });

    beforeEach(async () => {
        // Optionally: reset database or state before each test
    });

    describe("Scalars", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.scalars.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/scalars", {
                        operationFilesGlob: "root/*.ts",
                        typeFilesGlob: "root/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.rootString;
                const number = await sdk.query.rootNumber;
                const bool = await sdk.query.rootBoolean;

                expect(string).toBe("Hello, World!");
                expect(number).toBe(100);
                expect(bool).toBe(true);
            });
            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.scalars.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/scalars", {
                        operationFilesGlob: "root/with-args/*.ts",
                        typeFilesGlob: "root/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.rootWithArgsString({
                    arg: "Hello, World!",
                });
                const number = await sdk.query.rootWithArgsNumber({ arg: 100 });
                const bool = await sdk.query.rootWithArgsBoolean({ arg: true });

                expect(string).toBe("Hello, World!");
                expect(number).toBe(100);
                expect(bool).toBe(true);
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.scalars.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/scalars", {
                            operationFilesGlob: "root/*.ts",
                            typeFilesGlob: "root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const number = sdk.query.rootNumber.$lazy;
                    const string = sdk.query.rootString.$lazy;
                    const bool = sdk.query.rootBoolean.$lazy;

                    expect(await string()).toBe("Hello, World!");
                    expect(await number()).toBe(100);
                    expect(await bool()).toBe(true);
                });
                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.scalars.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/scalars", {
                            operationFilesGlob: "root/with-args/*.ts",
                            typeFilesGlob: "root/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const string = sdk.query.rootWithArgsString({
                        arg: _,
                    }).$lazy;
                    const number = sdk.query.rootWithArgsNumber({ arg: _ }).$lazy;
                    const bool = sdk.query.rootWithArgsBoolean({ arg: _ }).$lazy;

                    expect(await string({ arg: "Hello, World!" })).toBe("Hello, World!");
                    expect(await number({ arg: 100 })).toBe(100);
                    expect(await bool({ arg: true })).toBe(true);
                });
            });
        });
        describe("In objects", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.scalars.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/scalars", {
                        operationFilesGlob: "in-obj/*.ts",
                        typeFilesGlob: "in-obj/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.inObjString();
                const number = await sdk.query.inObjNumber();
                const bool = await sdk.query.inObjBoolean();
                const mixed = await sdk.query.inObjMixed();

                expect(string.string).toBe("Hello, World!");
                expect(number.number).toBe(100);
                expect(bool.boolean).toBe(true);

                expect(mixed.string).toBe("Hello, World!");
                expect(mixed.number).toBe(100);
                expect(mixed.boolean).toBe(true);
            });
            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.scalars.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/scalars", {
                        operationFilesGlob: "in-obj/with-args/*.ts",
                        typeFilesGlob: "in-obj/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.inObjWithArgsString({ arg: "Hello, World!" })();
                const number = await sdk.query.inObjWithArgsNumber({ arg: 100 })();
                const bool = await sdk.query.inObjWithArgsBoolean({ arg: true })();
                const mixed = await sdk.query.inObjWithArgsMixed({ arg1: "Hello, World!", arg2: 100, arg3: true })();

                expect(string.string).toBe("Hello, World!");
                expect(number.number).toBe(100);
                expect(bool.boolean).toBe(true);

                expect(mixed.string).toBe("Hello, World!");
                expect(mixed.number).toBe(100);
                expect(mixed.boolean).toBe(true);
            });
            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.scalars.in-obj").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/scalars", {
                            operationFilesGlob: "in-obj/*.ts",
                            typeFilesGlob: "in-obj/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const string = sdk.query.inObjString().$lazy;
                    const number = sdk.query.inObjNumber().$lazy;
                    const bool = sdk.query.inObjBoolean().$lazy;
                    const mixed = sdk.query.inObjMixed().$lazy;

                    const [resString, resNumber, resBool, resMixed] = await Promise.all([string(), number(), bool(), mixed()]);

                    expect(resString.string).toBe("Hello, World!");
                    expect(resNumber.number).toBe(100);
                    expect(resBool.boolean).toBe(true);

                    expect(resMixed.string).toBe("Hello, World!");
                    expect(resMixed.number).toBe(100);
                    expect(resMixed.boolean).toBe(true);
                });
                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.scalars.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/scalars", {
                            operationFilesGlob: "in-obj/with-args/*.ts",
                            typeFilesGlob: "in-obj/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const string = await sdk.query.inObjWithArgsString({ arg: _ })().$lazy;
                    const number = await sdk.query.inObjWithArgsNumber({ arg: _ })().$lazy;
                    const bool = await sdk.query.inObjWithArgsBoolean({ arg: _ })().$lazy;
                    const mixed = await sdk.query.inObjWithArgsMixed({ arg1: _, arg2: _, arg3: _ })().$lazy;

                    const [resString, resNumber, resBool, resMixed] = await Promise.all([
                        string({ arg: "Hello, World!" }),
                        number({ arg: 100 }),
                        bool({ arg: true }),
                        mixed({ arg1: "Hello, World!", arg2: 100, arg3: true }),
                    ]);

                    expect(resString.string).toBe("Hello, World!");
                    expect(resNumber.number).toBe(100);
                    expect(resBool.boolean).toBe(true);

                    expect(resMixed.string).toBe("Hello, World!");
                    expect(resMixed.number).toBe(100);
                    expect(resMixed.boolean).toBe(true);
                });
            });
        });
    });

    describe("Simple Lists", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.lists.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/lists", {
                        operationFilesGlob: "root/*.ts",
                        typeFilesGlob: "root/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.rootString;
                const number = await sdk.query.rootNumber;
                const bool = await sdk.query.rootBoolean;
                const obj = await sdk.query.rootObj();

                expect(string).toEqual(["Hello", "World", "!"]);
                expect(number).toEqual([1, 2, 3, 4, 5]);
                expect(bool).toEqual([true, false, true]);
                expect(obj).toEqual([
                    { name: "Person 1", age: 10 },
                    { name: "Person 2", age: 20 },
                    { name: "Person 3", age: 30 },
                ]);
            });
            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.lists.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/lists", {
                        operationFilesGlob: "root/with-args/*.ts",
                        typeFilesGlob: "root/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.rootWithArgsString({
                    arg: ["Hello", "World", "!"],
                });
                const obj = await sdk.query.rootWithArgsObj({
                    persons: [
                        { name: "Person 1", age: 10 },
                        { name: "Person 2", age: 20 },
                        { name: "Person 3", age: 30 },
                    ],
                })();

                expect(string).toEqual(["Hello", "World", "!"]);
                expect(obj).toEqual([
                    { name: "Person 1", age: 10 },
                    { name: "Person 2", age: 20 },
                    { name: "Person 3", age: 30 },
                ]);
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.lists.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/lists", {
                            operationFilesGlob: "root/*.ts",
                            typeFilesGlob: "root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const string = sdk.query.rootString.$lazy;
                    const number = sdk.query.rootNumber.$lazy;
                    const bool = sdk.query.rootBoolean.$lazy;
                    const obj = sdk.query.rootObj().$lazy;

                    expect(await string()).toEqual(["Hello", "World", "!"]);
                    expect(await number()).toEqual([1, 2, 3, 4, 5]);
                    expect(await bool()).toEqual([true, false, true]);
                    expect(await obj()).toEqual([
                        { name: "Person 1", age: 10 },
                        { name: "Person 2", age: 20 },
                        { name: "Person 3", age: 30 },
                    ]);
                });
                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.lists.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/lists", {
                            operationFilesGlob: "root/with-args/*.ts",
                            typeFilesGlob: "root/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const string = sdk.query.rootWithArgsString({
                        arg: _,
                    }).$lazy;
                    const obj = sdk.query.rootWithArgsObj({
                        persons: _,
                    })().$lazy;

                    expect(await string({ arg: ["Hello", "World", "!"] })).toEqual(["Hello", "World", "!"]);
                    expect(
                        await obj({
                            persons: [
                                { name: "Person 1", age: 10 },
                                { name: "Person 2", age: 20 },
                                { name: "Person 3", age: 30 },
                            ],
                        }),
                    ).toEqual([
                        { name: "Person 1", age: 10 },
                        { name: "Person 2", age: 20 },
                        { name: "Person 3", age: 30 },
                    ]);
                });
            });
        });
        describe("In objects", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.lists.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/lists", {
                        operationFilesGlob: "in-obj/*.ts",
                        typeFilesGlob: "in-obj/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.inObjString();
                const number = await sdk.query.inObjNumber();
                const bool = await sdk.query.inObjBoolean();
                const obj = await sdk.query.inObjObj();

                expect(string.strings).toEqual(["Hello", "World", "!"]);
                expect(number.numbers).toEqual([1, 2, 3, 4, 5]);
                expect(bool.booleans).toEqual([true, false, true]);
                expect(obj.persons).toEqual([
                    { name: "Person 1", age: 10 },
                    { name: "Person 2", age: 20 },
                    { name: "Person 3", age: 30 },
                ]);
            });
            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.lists.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/lists", {
                        operationFilesGlob: "in-obj/with-args/*.ts",
                        typeFilesGlob: "in-obj/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.inObjWithArgsString({ arg: ["Hello", "World", "!"] })();
                const obj = await sdk.query.inObjWithArgsObj({
                    persons: [
                        { name: "Person 1", age: 10 },
                        { name: "Person 2", age: 20 },
                        { name: "Person 3", age: 30 },
                    ],
                })();

                expect(string.strings).toEqual(["Hello", "World", "!"]);
                expect(obj.persons).toEqual([
                    { name: "Person 1", age: 10 },
                    { name: "Person 2", age: 20 },
                    { name: "Person 3", age: 30 },
                ]);
            });
            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.lists.in-obj").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/lists", {
                            operationFilesGlob: "in-obj/*.ts",
                            typeFilesGlob: "in-obj/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const string = sdk.query.inObjString().$lazy;
                    const number = sdk.query.inObjNumber().$lazy;
                    const bool = sdk.query.inObjBoolean().$lazy;
                    const obj = sdk.query.inObjObj().$lazy;

                    expect(await string()).toEqual({ strings: ["Hello", "World", "!"] });
                    expect(await number()).toEqual({ numbers: [1, 2, 3, 4, 5] });
                    expect(await bool()).toEqual({ booleans: [true, false, true] });
                    expect(await obj()).toEqual({
                        persons: [
                            { name: "Person 1", age: 10 },
                            { name: "Person 2", age: 20 },
                            { name: "Person 3", age: 30 },
                        ],
                    });
                });
                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.lists.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/lists", {
                            operationFilesGlob: "in-obj/with-args/*.ts",
                            typeFilesGlob: "in-obj/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const string = sdk.query.inObjWithArgsString({ arg: _ })().$lazy;
                    const obj = sdk.query.inObjWithArgsObj({
                        persons: _,
                    })().$lazy;

                    expect(await string({ arg: ["Hello", "World", "!"] })).toEqual({ strings: ["Hello", "World", "!"] });
                    expect(
                        await obj({
                            persons: [
                                { name: "Person 1", age: 10 },
                                { name: "Person 2", age: 20 },
                                { name: "Person 3", age: 30 },
                            ],
                        }),
                    ).toEqual({
                        persons: [
                            { name: "Person 1", age: 10 },
                            { name: "Person 2", age: 20 },
                            { name: "Person 3", age: 30 },
                        ],
                    });
                });
            });
        });
    });

    describe("Unions", () => {
        describe("Custom Scalar Unions", () => {
            describe("Root fields", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.custom-scalar.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "custom-scalar/root/*.ts",
                            typeFilesGlob: "custom-scalar/root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const simple = await sdk.query.customScalarRootSimple;

                    expect(simple).toBe("Hello, World!");
                });
                test("With args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.custom-scalar.root.with-args").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "custom-scalar/root/with-args/*.ts",
                            typeFilesGlob: "custom-scalar/root/with-args/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const stringResult = await sdk.query.customScalarRootWithArgsSimple({ arg: "Hello" });
                    const numberResult = await sdk.query.customScalarRootWithArgsSimple({ arg: 42 });

                    expect(stringResult).toBe("Hello");
                    expect(numberResult).toBe(42);
                });

                describe("with $lazy", () => {
                    test("No args", async () => {
                        const _sdk = (await import("./tests/.sdks/tests.unions.custom-scalar.root").catch(console.error))?.default;
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "custom-scalar/root/*.ts",
                                typeFilesGlob: "custom-scalar/root/*.ts",
                            })
                        )(_sdk);
                        if (!_sdk) return;

                        const sdk = _sdk;

                        const simple = sdk.query.customScalarRootSimple.$lazy;

                        expect(await simple()).toBe("Hello, World!");
                    });
                    test("With args", async () => {
                        const _sdk = await import("./tests/.sdks/tests.unions.custom-scalar.root.with-args").catch(console.error);
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "custom-scalar/root/with-args/*.ts",
                                typeFilesGlob: "custom-scalar/root/with-args/*.ts",
                            })
                        )(_sdk?.default);
                        if (!_sdk) return;

                        const sdk = _sdk.default;
                        const _ = _sdk._;

                        const simple = sdk.query.customScalarRootWithArgsSimple({ arg: _ }).$lazy;

                        expect(await simple({ arg: "Hello" })).toBe("Hello");
                        expect(await simple({ arg: 42 })).toBe(42);
                    });
                });
            });
            describe("In objects", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.custom-scalar.in-obj").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "custom-scalar/in-obj/*.ts",
                            typeFilesGlob: "custom-scalar/in-obj/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const simple = await sdk.query.customScalarInObjSimple();

                    expect(simple.value).toBe("Hello, World!");
                });
                test("With args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.custom-scalar.in-obj.with-args").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "custom-scalar/in-obj/with-args/*.ts",
                            typeFilesGlob: "custom-scalar/in-obj/with-args/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const stringResult = await sdk.query.customScalarInObjWithArgsSimple({ arg: "Hello" })();
                    const numberResult = await sdk.query.customScalarInObjWithArgsSimple({ arg: 42 })();

                    const argsUnionResult = await sdk.query.customScalarInObjWithArgsArgsUnion({ arg: { event: "click", payload: "Hello" } })(
                        ({ value }) => ({
                            value: value(({ $on }) => ({
                                ...$on._event_click_payload_string_(({ event, payload }) => ({ event, payload })),
                            })),
                        }),
                    );
                    const argsUnionResult2 = await sdk.query.customScalarInObjWithArgsArgsUnion({ arg: { event: "scroll", payload: 42 } })(
                        ({ value }) => ({
                            value: value(({ $on }) => ({
                                ...$on._event_scroll_payload_number_(({ event, payload }) => ({ event, payload })),
                            })),
                        }),
                    );
                    const argsUnionResult3 = await sdk.query.customScalarInObjWithArgsArgsUnion({ arg: { event: "mouseover", payload: true } })(
                        ({ value }) => ({
                            value: value(({ $on }) => ({
                                ...$on._event_mouseover_payload_boolean_(({ event, payload }) => ({ event, payload })),
                            })),
                        }),
                    );

                    expect(stringResult.value).toBe("Hello");
                    expect(numberResult.value).toBe(42);

                    expect(argsUnionResult.value).toEqual({ event: "click", payload: "Hello" });
                    expect(argsUnionResult2.value).toEqual({ event: "scroll", payload: 42 });
                    expect(argsUnionResult3.value).toEqual({ event: "mouseover", payload: true });
                });
                describe("with $lazy", () => {
                    test("No args", async () => {
                        const _sdk = await import("./tests/.sdks/tests.unions.custom-scalar.in-obj").catch(console.error);
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "custom-scalar/in-obj/*.ts",
                                typeFilesGlob: "custom-scalar/in-obj/*.ts",
                            })
                        )(_sdk?.default);
                        if (!_sdk) return;

                        const sdk = _sdk.default;
                        const _ = _sdk._;

                        const simple = sdk.query.customScalarInObjSimple().$lazy;

                        expect((await simple()).value).toBe("Hello, World!");
                    });
                    test("With args", async () => {
                        const _sdk = await import("./tests/.sdks/tests.unions.custom-scalar.in-obj.with-args").catch(console.error);
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "custom-scalar/in-obj/with-args/*.ts",
                                typeFilesGlob: "custom-scalar/in-obj/with-args/*.ts",
                            })
                        )(_sdk?.default);
                        if (!_sdk) return;

                        const sdk = _sdk.default;
                        const _ = _sdk._;

                        const simple = sdk.query.customScalarInObjWithArgsSimple({ arg: _ })().$lazy;

                        expect((await simple({ arg: "Hello" })).value).toBe("Hello");
                        expect((await simple({ arg: 42 })).value).toBe(42);
                    });
                });
            });
        });
        describe("GraphQL Unions", () => {
            describe("Root fields", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.gql-unions.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "gql-unions/root/*.ts",
                            typeFilesGlob: "gql-unions/root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const simple = await sdk.query.gqlUnionsRootSimple(({ $on }) => ({
                        ...$on._title_string_description_string_(),
                    }));

                    expect(simple).toEqual({ title: "Hello, World!", description: "This is a test" });
                });
                test("No args, with aliasing", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.gql-unions.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "gql-unions/root/*.ts",
                            typeFilesGlob: "gql-unions/root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const simple = await sdk.query.gqlUnionsRootSimple(({ $on }) => ({
                        alias1: $on._title_string_description_string_(),
                    }));

                    expect(simple.alias1).toEqual({ title: "Hello, World!", description: "This is a test" });
                });
                test("With args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.gql-unions.root.with-args").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "gql-unions/root/with-args/*.ts",
                            typeFilesGlob: "gql-unions/root/with-args/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const urlResult = await sdk.query.gqlUnionsRootWithArgsSimple({ returnUrl: true })(({ $on }) => ({ ...$on._url_string_() }));
                    const titleResult = await sdk.query.gqlUnionsRootWithArgsSimple({ returnUrl: false })(({ $on }) => ({
                        ...$on._title_string_description_string_(),
                    }));

                    expect(urlResult).toEqual({ url: "https://www.google.com" });
                    expect(titleResult).toEqual({ title: "Hello, World!", description: "This is a test" });
                });
                test("With args, with aliasing", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.gql-unions.root.with-args").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "gql-unions/root/with-args/*.ts",
                            typeFilesGlob: "gql-unions/root/with-args/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const simple = await sdk.query.gqlUnionsRootWithArgsSimple({ returnUrl: true })(({ $on }) => ({
                        alias1: $on._url_string_(),
                    }));

                    expect(simple.alias1).toEqual({ url: "https://www.google.com" });

                    const simple2 = await sdk.query.gqlUnionsRootWithArgsSimple({ returnUrl: false })(({ $on }) => ({
                        alias1: $on._title_string_description_string_(),
                    }));

                    expect(simple2.alias1).toEqual({ title: "Hello, World!", description: "This is a test" });
                });

                describe("with $lazy", () => {
                    test("No args", async () => {
                        const _sdk = (await import("./tests/.sdks/tests.unions.gql-unions.root").catch(console.error))?.default;
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "gql-unions/root/*.ts",
                                typeFilesGlob: "gql-unions/root/*.ts",
                            })
                        )(_sdk);
                        if (!_sdk) return;

                        const sdk = _sdk;

                        const simple = sdk.query.gqlUnionsRootSimple(({ $on }) => ({
                            ...$on._title_string_description_string_(),
                        })).$lazy;

                        expect(await simple()).toEqual({ title: "Hello, World!", description: "This is a test" });
                    });
                    test("No args, with aliasing", async () => {
                        const _sdk = (await import("./tests/.sdks/tests.unions.gql-unions.root").catch(console.error))?.default;
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "gql-unions/root/*.ts",
                                typeFilesGlob: "gql-unions/root/*.ts",
                            })
                        )(_sdk);
                        if (!_sdk) return;

                        const sdk = _sdk;

                        const simple = sdk.query.gqlUnionsRootSimple(({ $on }) => ({
                            alias1: $on._title_string_description_string_(),
                        })).$lazy;

                        expect((await simple()).alias1).toEqual({ title: "Hello, World!", description: "This is a test" });
                    });
                    test("With args", async () => {
                        const _sdk = await import("./tests/.sdks/tests.unions.gql-unions.root.with-args").catch(console.error);
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "gql-unions/root/with-args/*.ts",
                                typeFilesGlob: "gql-unions/root/with-args/*.ts",
                            })
                        )(_sdk?.default);
                        if (!_sdk) return;

                        const sdk = _sdk.default;
                        const _ = _sdk._;

                        const urlResult = sdk.query.gqlUnionsRootWithArgsSimple({ returnUrl: _ })(({ $on }) => ({ ...$on._url_string_() })).$lazy;
                        const titleResult = sdk.query.gqlUnionsRootWithArgsSimple({ returnUrl: _ })(({ $on }) => ({
                            ...$on._title_string_description_string_(),
                        })).$lazy;

                        expect(await urlResult({ returnUrl: true })).toEqual({ url: "https://www.google.com" });
                        expect(await titleResult({ returnUrl: false })).toEqual({ title: "Hello, World!", description: "This is a test" });
                    });
                    test("With args, with aliasing", async () => {
                        const _sdk = await import("./tests/.sdks/tests.unions.gql-unions.root.with-args").catch(console.error);
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "gql-unions/root/with-args/*.ts",
                                typeFilesGlob: "gql-unions/root/with-args/*.ts",
                            })
                        )(_sdk?.default);
                        if (!_sdk) return;

                        const sdk = _sdk.default;
                        const _ = _sdk._;

                        const urlResult = sdk.query.gqlUnionsRootWithArgsSimple({ returnUrl: _ })(({ $on }) => ({
                            alias1: $on._url_string_(),
                        })).$lazy;
                        const titleResult = sdk.query.gqlUnionsRootWithArgsSimple({ returnUrl: _ })(({ $on }) => ({
                            alias1: $on._title_string_description_string_(),
                        })).$lazy;

                        expect((await urlResult({ returnUrl: true })).alias1).toEqual({ url: "https://www.google.com" });
                        expect((await titleResult({ returnUrl: false })).alias1).toEqual({ title: "Hello, World!", description: "This is a test" });
                    });
                });
            });
            describe("In objects", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.gql-unions.in-obj").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "gql-unions/in-obj/*.ts",
                            typeFilesGlob: "gql-unions/in-obj/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const titleResult = await sdk.query.gqlUnionsInObjSimple(({ value }) => ({
                        value: value(({ $on }) => ({
                            ...$on._title_string_description_string_(({ title, description }) => ({ title, description })),
                        })),
                    }));

                    expect(titleResult).toEqual({ value: { title: "Hello, World!", description: "This is a test" } });
                });
                test("No args, with aliasing", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.gql-unions.in-obj").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "gql-unions/in-obj/*.ts",
                            typeFilesGlob: "gql-unions/in-obj/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const titleResult = await sdk.query.gqlUnionsInObjSimple(({ value }) => ({
                        value: value(({ $on }) => ({
                            alias1: $on._title_string_description_string_(({ title, description }) => ({ title, description })),
                        })),
                    }));

                    expect(titleResult).toEqual({ value: { alias1: { title: "Hello, World!", description: "This is a test" } } });
                    expect(titleResult.value).toEqual({ alias1: { title: "Hello, World!", description: "This is a test" } });
                    expect(titleResult.value.alias1).toEqual({ title: "Hello, World!", description: "This is a test" });
                    expect(titleResult.value.alias1.title).toEqual("Hello, World!");
                    expect(titleResult.value.alias1.description).toEqual("This is a test");
                });
                test("With args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.gql-unions.in-obj.with-args").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "gql-unions/in-obj/with-args/*.ts",
                            typeFilesGlob: "gql-unions/in-obj/with-args/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const urlResult = await sdk.query.gqlUnionsInObjWithArgsSimple({ returnUrl: true })(({ $on }) => ({
                        ...$on._value_url_string_title_undefined_description_undefined_(({ value }) => ({ value: value(({ url }) => ({ url })) })),
                    }));
                    const titleResult = await sdk.query.gqlUnionsInObjWithArgsSimple({ returnUrl: false })(({ $on }) => ({
                        ...$on._value_title_string_description_string_url_undefined_(({ value }) => ({
                            value: value(({ title, description }) => ({ title, description })),
                        })),
                    }));

                    expect(urlResult).toEqual({ value: { url: "https://www.google.com" } });
                    expect(titleResult).toEqual({ value: { title: "Hello, World!", description: "This is a test" } });
                });
                test("With args, with aliasing", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.unions.gql-unions.in-obj.with-args").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/unions", {
                            operationFilesGlob: "gql-unions/in-obj/with-args/*.ts",
                            typeFilesGlob: "gql-unions/in-obj/with-args/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const urlResult = await sdk.query.gqlUnionsInObjWithArgsSimple({ returnUrl: true })(({ $on }) => ({
                        alias1: $on._value_url_string_title_undefined_description_undefined_(({ value }) => ({
                            value: value(({ url }) => ({ url })),
                        })),
                        alias2: $on._value_url_string_title_undefined_description_undefined_(({ value }) => ({
                            value: value(({ url }) => ({ url })),
                        })),
                    }));
                    const titleResult = await sdk.query.gqlUnionsInObjWithArgsSimple({ returnUrl: false })(({ $on }) => ({
                        alias1: $on._value_title_string_description_string_url_undefined_(({ value }) => ({
                            value: value(({ title, description }) => ({ title, description })),
                        })),
                    }));

                    expect(urlResult).toEqual({
                        alias1: { value: { url: "https://www.google.com" } },
                        alias2: { value: { url: "https://www.google.com" } },
                    });

                    expect(urlResult.alias1).toEqual({ value: { url: "https://www.google.com" } });
                    expect(urlResult.alias1.value).toEqual({ url: "https://www.google.com" });
                    expect(urlResult.alias1.value.url).toEqual("https://www.google.com");

                    expect(urlResult.alias2).toEqual({ value: { url: "https://www.google.com" } });
                    expect(urlResult.alias2.value).toEqual({ url: "https://www.google.com" });
                    expect(urlResult.alias2.value.url).toEqual("https://www.google.com");

                    expect(titleResult).toEqual({
                        alias1: { value: { title: "Hello, World!", description: "This is a test" } },
                    });

                    expect(titleResult.alias1).toEqual({ value: { title: "Hello, World!", description: "This is a test" } });
                    expect(titleResult.alias1.value).toEqual({ title: "Hello, World!", description: "This is a test" });
                    expect(titleResult.alias1.value.title).toEqual("Hello, World!");
                    expect(titleResult.alias1.value.description).toEqual("This is a test");
                });
                describe("with $lazy", () => {
                    test("No args", async () => {
                        const _sdk = await import("./tests/.sdks/tests.unions.gql-unions.in-obj").catch(console.error);
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "gql-unions/in-obj/*.ts",
                                typeFilesGlob: "gql-unions/in-obj/*.ts",
                            })
                        )(_sdk?.default);
                        if (!_sdk) return;

                        const sdk = _sdk.default;
                        const _ = _sdk._;

                        const titleResult = sdk.query.gqlUnionsInObjSimple(({ value }) => ({
                            value: value(({ $on }) => ({
                                ...$on._title_string_description_string_(({ title, description }) => ({ title, description })),
                            })),
                        })).$lazy;

                        expect((await titleResult()).value).toEqual({ title: "Hello, World!", description: "This is a test" });
                    });
                    test("No args, with aliasing", async () => {
                        const _sdk = await import("./tests/.sdks/tests.unions.gql-unions.in-obj").catch(console.error);
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "gql-unions/in-obj/*.ts",
                                typeFilesGlob: "gql-unions/in-obj/*.ts",
                            })
                        )(_sdk?.default);
                        if (!_sdk) return;

                        const sdk = _sdk.default;
                        const _ = _sdk._;

                        const titleResult = sdk.query.gqlUnionsInObjSimple(({ value }) => ({
                            value: value(({ $on }) => ({
                                alias1: $on._title_string_description_string_(({ title, description }) => ({ title, description })),
                            })),
                        })).$lazy;

                        expect(await titleResult()).toEqual({ value: { alias1: { title: "Hello, World!", description: "This is a test" } } });

                        expect((await titleResult()).value).toEqual({ alias1: { title: "Hello, World!", description: "This is a test" } });
                        expect((await titleResult()).value.alias1).toEqual({ title: "Hello, World!", description: "This is a test" });
                        expect((await titleResult()).value.alias1.title).toEqual("Hello, World!");
                        expect((await titleResult()).value.alias1.description).toEqual("This is a test");
                    });

                    test("With args", async () => {
                        const _sdk = await import("./tests/.sdks/tests.unions.gql-unions.in-obj.with-args").catch(console.error);
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "gql-unions/in-obj/with-args/*.ts",
                                typeFilesGlob: "gql-unions/in-obj/with-args/*.ts",
                            })
                        )(_sdk?.default);
                        if (!_sdk) return;

                        const sdk = _sdk.default;
                        const _ = _sdk._;

                        const urlResult = sdk.query.gqlUnionsInObjWithArgsSimple({ returnUrl: _ })(({ $on }) => ({
                            ...$on._value_url_string_title_undefined_description_undefined_(({ value }) => ({
                                value: value(({ url }) => ({ url })),
                            })),
                        })).$lazy;
                        const titleResult = sdk.query.gqlUnionsInObjWithArgsSimple({ returnUrl: _ })(({ $on }) => ({
                            ...$on._value_title_string_description_string_url_undefined_(({ value }) => ({
                                value: value(({ title, description }) => ({ title, description })),
                            })),
                        })).$lazy;

                        expect((await urlResult({ returnUrl: true })).value).toEqual({ url: "https://www.google.com" });
                        expect((await titleResult({ returnUrl: false })).value).toEqual({ title: "Hello, World!", description: "This is a test" });
                    });
                    test("With args, with aliasing", async () => {
                        const _sdk = await import("./tests/.sdks/tests.unions.gql-unions.in-obj.with-args").catch(console.error);
                        (
                            await makeHandlerFromDir("./tests/unions", {
                                operationFilesGlob: "gql-unions/in-obj/with-args/*.ts",
                                typeFilesGlob: "gql-unions/in-obj/with-args/*.ts",
                            })
                        )(_sdk?.default);
                        if (!_sdk) return;

                        const sdk = _sdk.default;
                        const _ = _sdk._;

                        const urlResult = sdk.query.gqlUnionsInObjWithArgsSimple({ returnUrl: _ })(({ $on }) => ({
                            alias1: $on._value_url_string_title_undefined_description_undefined_(({ value }) => ({
                                value: value(({ url }) => ({ url })),
                            })),
                        })).$lazy;
                        const titleResult = sdk.query.gqlUnionsInObjWithArgsSimple({ returnUrl: _ })(({ $on }) => ({
                            alias1: $on._value_title_string_description_string_url_undefined_(({ value }) => ({
                                value: value(({ title, description }) => ({ title, description })),
                            })),
                        })).$lazy;

                        expect(await urlResult({ returnUrl: true })).toEqual({ alias1: { value: { url: "https://www.google.com" } } });

                        expect((await urlResult({ returnUrl: true })).alias1).toEqual({ value: { url: "https://www.google.com" } });
                        expect((await urlResult({ returnUrl: true })).alias1.value).toEqual({ url: "https://www.google.com" });
                        expect((await urlResult({ returnUrl: true })).alias1.value.url).toEqual("https://www.google.com");

                        expect(await titleResult({ returnUrl: false })).toEqual({
                            alias1: { value: { title: "Hello, World!", description: "This is a test" } },
                        });

                        expect((await titleResult({ returnUrl: false })).alias1).toEqual({
                            value: { title: "Hello, World!", description: "This is a test" },
                        });
                        expect((await titleResult({ returnUrl: false })).alias1.value).toEqual({
                            title: "Hello, World!",
                            description: "This is a test",
                        });
                        expect((await titleResult({ returnUrl: false })).alias1.value.title).toEqual("Hello, World!");
                        expect((await titleResult({ returnUrl: false })).alias1.value.description).toEqual("This is a test");
                    });
                });
            });
        });
    });

    describe("Enums", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.enums.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/enums", {
                        operationFilesGlob: "root/*.ts",
                        typeFilesGlob: "root/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const simple = await sdk.query.rootSimple;

                expect(simple).toBe("RED");
            });
            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.enums.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/enums", {
                        operationFilesGlob: "root/with-args/*.ts",
                        typeFilesGlob: "root/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const red = await sdk.query.rootWithArgsSimple({ arg: "RED" });
                const green = await sdk.query.rootWithArgsSimple({ arg: "GREEN" });
                const blue = await sdk.query.rootWithArgsSimple({ arg: "BLUE" });

                expect(red).toBe("RED");
                expect(green).toBe("GREEN");
                expect(blue).toBe("BLUE");
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.enums.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/enums", {
                            operationFilesGlob: "root/*.ts",
                            typeFilesGlob: "root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const simple = sdk.query.rootSimple.$lazy;

                    expect(await simple()).toBe("RED");
                });
                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.enums.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/enums", {
                            operationFilesGlob: "root/with-args/*.ts",
                            typeFilesGlob: "root/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const simple = sdk.query.rootWithArgsSimple({ arg: _ }).$lazy;

                    expect(await simple({ arg: "RED" })).toBe("RED");
                    expect(await simple({ arg: "GREEN" })).toBe("GREEN");
                    expect(await simple({ arg: "BLUE" })).toBe("BLUE");
                });
            });
        });
        describe("In objects", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.enums.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/enums", {
                        operationFilesGlob: "in-obj/*.ts",
                        typeFilesGlob: "in-obj/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const simple = await sdk.query.inObjSimple();

                expect(simple.color).toBe("RED");
            });
            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.enums.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/enums", {
                        operationFilesGlob: "in-obj/with-args/*.ts",
                        typeFilesGlob: "in-obj/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const red = await sdk.query.inObjWithArgsSimple({ arg: "RED" })();
                const green = await sdk.query.inObjWithArgsSimple({ arg: "GREEN" })();

                expect(red.color).toBe("RED");
                expect(green.color).toBe("GREEN");
            });
            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.enums.in-obj").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/enums", {
                            operationFilesGlob: "in-obj/*.ts",
                            typeFilesGlob: "in-obj/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const simple = sdk.query.inObjSimple().$lazy;

                    expect((await simple()).color).toBe("RED");
                });
                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.enums.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/enums", {
                            operationFilesGlob: "in-obj/with-args/*.ts",
                            typeFilesGlob: "in-obj/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const simple = sdk.query.inObjWithArgsSimple({ arg: _ })().$lazy;

                    expect((await simple({ arg: "RED" })).color).toBe("RED");
                    expect((await simple({ arg: "GREEN" })).color).toBe("GREEN");
                });
            });
        });
    });

    describe("Mutations", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.mutations.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/mutations", {
                        operationFilesGlob: "root/*.ts",
                        typeFilesGlob: "root/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const result = await sdk.mutation.rootString;

                expect(result).toBe("Hello, World!");
            });

            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.mutations.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/mutations", {
                        operationFilesGlob: "root/with-args/*.ts",
                        typeFilesGlob: "root/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const result = await sdk.mutation.rootWithArgsString({
                    arg: "Hello, World!",
                });

                expect(result).toBe("Hello, World!");
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.mutations.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/mutations", {
                            operationFilesGlob: "root/*.ts",
                            typeFilesGlob: "root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const string = sdk.mutation.rootString.$lazy;

                    expect(await string()).toBe("Hello, World!");
                });

                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.mutations.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/mutations", {
                            operationFilesGlob: "root/with-args/*.ts",
                            typeFilesGlob: "root/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const string = sdk.mutation.rootWithArgsString({
                        arg: _,
                    }).$lazy;

                    expect(await string({ arg: "Hello, World!" })).toBe("Hello, World!");
                });
            });
        });
        describe("In objects", () => {
            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.mutations.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/mutations", {
                        operationFilesGlob: "in-obj/with-args/*.ts",
                        typeFilesGlob: "in-obj/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const result = await sdk.mutation.inObjWithArgsString({
                    arg: "Hello, World!",
                })();

                expect(result.result).toBe("Hello, World!");
            });
            describe("with $lazy", () => {
                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.mutations.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/mutations", {
                            operationFilesGlob: "in-obj/with-args/*.ts",
                            typeFilesGlob: "in-obj/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const string = sdk.mutation.inObjWithArgsString({
                        arg: _,
                    })().$lazy;

                    expect((await string({ arg: "Hello, World!" })).result).toBe("Hello, World!");
                });
            });
        });
    });

    describe("Subscriptions", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.subscriptions.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/subscriptions", {
                        operationFilesGlob: "root/*.ts",
                        typeFilesGlob: "root/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const results: string[] = [];
                for await (const value of await sdk.subscription.rootString) {
                    results.push(value);
                }

                expect(results).toEqual(["Hello", "World"]);
            });

            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.subscriptions.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/subscriptions", {
                        operationFilesGlob: "root/with-args/*.ts",
                        typeFilesGlob: "root/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const results: string[] = [];
                for await (const value of await sdk.subscription.rootWithArgsString({ message: "Hello" })) {
                    results.push(value);
                }

                expect(results).toEqual(["Hello", "Hello"]);
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.subscriptions.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/subscriptions", {
                            operationFilesGlob: "root/*.ts",
                            typeFilesGlob: "root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const iterable = sdk.subscription.rootString.$lazy;

                    const results: string[] = [];
                    for await (const value of await iterable()) {
                        results.push(value);
                    }

                    expect(results).toEqual(["Hello", "World"]);
                });

                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.subscriptions.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/subscriptions", {
                            operationFilesGlob: "root/with-args/*.ts",
                            typeFilesGlob: "root/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const iterable = sdk.subscription.rootWithArgsString({ message: _ }).$lazy;

                    const results: string[] = [];
                    for await (const value of await iterable({ message: "Hello" })) {
                        results.push(value);
                    }

                    expect(results).toEqual(["Hello", "Hello"]);
                });
            });
        });
        describe("In objects", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.subscriptions.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/subscriptions", {
                        operationFilesGlob: "in-obj/*.ts",
                        typeFilesGlob: "in-obj/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const results: Array<{ message: string }> = [];
                for await (const value of await sdk.subscription.inObjString()) {
                    results.push(value);
                }

                expect(results).toEqual([{ message: "Hello" }, { message: "World" }]);
            });

            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.subscriptions.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/subscriptions", {
                        operationFilesGlob: "in-obj/with-args/*.ts",
                        typeFilesGlob: "in-obj/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;
                const sdk = _sdk;

                const results: Array<{ message: string }> = [];
                for await (const value of await sdk.subscription.inObjWithArgsString({ message: "Hello" })()) {
                    results.push(value);
                }

                expect(results).toEqual([{ message: "Hello" }, { message: "Hello" }]);
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.subscriptions.in-obj").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/subscriptions", {
                            operationFilesGlob: "in-obj/*.ts",
                            typeFilesGlob: "in-obj/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const iterable = sdk.subscription.inObjString().$lazy;

                    const results: Array<{ message: string }> = [];
                    for await (const value of await iterable()) {
                        results.push(value);
                    }

                    expect(results).toEqual([{ message: "Hello" }, { message: "World" }]);
                });

                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.subscriptions.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/subscriptions", {
                            operationFilesGlob: "in-obj/with-args/*.ts",
                            typeFilesGlob: "in-obj/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const iterable = sdk.subscription.inObjWithArgsString({ message: _ })().$lazy;

                    const results: Array<{ message: string }> = [];
                    for await (const value of await iterable({ message: "Hello" })) {
                        results.push(value);
                    }

                    expect(results).toEqual([{ message: "Hello" }, { message: "Hello" }]);
                });
            });
        });
    });

    describe("Nested", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.nested.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/nested", {
                        operationFilesGlob: "root/*.ts",
                        typeFilesGlob: "root/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const simple = await sdk.query.rootSimple();

                expect(simple.user.name).toBe("John");
                expect(simple.user.address.street).toBe("123 Main St");
                expect(simple.user.address.city).toBe("New York");
            });
            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.nested.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/nested", {
                        operationFilesGlob: "root/with-args/*.ts",
                        typeFilesGlob: "root/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const result = await sdk.query.rootWithArgsSimple({
                    arg: "Jane",
                })();

                expect(result.user.name).toBe("Jane");
                expect(result.user.address.street).toBe("123 Main St");
                expect(result.user.address.city).toBe("New York");
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.nested.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/nested", {
                            operationFilesGlob: "root/*.ts",
                            typeFilesGlob: "root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const simple = sdk.query.rootSimple().$lazy;

                    const result = await simple();
                    expect(result.user.name).toBe("John");
                    expect(result.user.address.street).toBe("123 Main St");
                    expect(result.user.address.city).toBe("New York");
                });
                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.nested.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/nested", {
                            operationFilesGlob: "root/with-args/*.ts",
                            typeFilesGlob: "root/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const simple = sdk.query.rootWithArgsSimple({
                        arg: _,
                    })().$lazy;

                    const result = await simple({ arg: "Jane" });
                    expect(result.user.name).toBe("Jane");
                    expect(result.user.address.street).toBe("123 Main St");
                    expect(result.user.address.city).toBe("New York");
                });
            });
        });
        describe("In objects", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.nested.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/nested", {
                        operationFilesGlob: "in-obj/*.ts",
                        typeFilesGlob: "in-obj/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const simple = await sdk.query.inObjSimple();

                expect(simple.data.user.name).toBe("John");
                expect(simple.data.user.address.street).toBe("123 Main St");
                expect(simple.data.user.address.city).toBe("New York");
            });
            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.nested.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/nested", {
                        operationFilesGlob: "in-obj/with-args/*.ts",
                        typeFilesGlob: "in-obj/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const result = await sdk.query.inObjWithArgsSimple({
                    arg: "Jane",
                })();

                expect(result.data.user.name).toBe("Jane");
                expect(result.data.user.address.street).toBe("123 Main St");
                expect(result.data.user.address.city).toBe("New York");
            });
            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.nested.in-obj").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/nested", {
                            operationFilesGlob: "in-obj/*.ts",
                            typeFilesGlob: "in-obj/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const simple = sdk.query.inObjSimple().$lazy;

                    const result = await simple();
                    expect(result.data.user.name).toBe("John");
                    expect(result.data.user.address.street).toBe("123 Main St");
                    expect(result.data.user.address.city).toBe("New York");
                });
                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.nested.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/nested", {
                            operationFilesGlob: "in-obj/with-args/*.ts",
                            typeFilesGlob: "in-obj/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const simple = sdk.query.inObjWithArgsSimple({
                        arg: _,
                    })().$lazy;

                    const result = await simple({ arg: "Jane" });
                    expect(result.data.user.name).toBe("Jane");
                    expect(result.data.user.address.street).toBe("123 Main St");
                    expect(result.data.user.address.city).toBe("New York");
                });
            });
        });
    });

    describe("Nullable", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.nullable.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/nullable", {
                        operationFilesGlob: "root/*.ts",
                        typeFilesGlob: "root/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const optional = await sdk.query.rootOptional;

                expect(optional).toBeNull();
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./tests/.sdks/tests.nullable.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./tests/nullable", {
                            operationFilesGlob: "root/*.ts",
                            typeFilesGlob: "root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const optional = sdk.query.rootOptional.$lazy;

                    expect(await optional()).toBeNull();
                });
            });
        });
        describe("In objects", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.nullable.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/nullable", {
                        operationFilesGlob: "in-obj/*.ts",
                        typeFilesGlob: "in-obj/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const optional = await sdk.query.inObjOptional();

                expect(optional.optionalField).toBeNull();
                expect(optional.requiredField).toBe("required");
            });
            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.nullable.in-obj").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/nullable", {
                            operationFilesGlob: "in-obj/*.ts",
                            typeFilesGlob: "in-obj/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const optional = sdk.query.inObjOptional().$lazy;

                    const result = await optional();
                    expect(result.optionalField).toBeNull();
                    expect(result.requiredField).toBe("required");
                });
            });
        });
    });

    describe("Complex", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.complex.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/complex", {
                        operationFilesGlob: "root/*.ts",
                        typeFilesGlob: "root/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const result = await sdk.query.rootMixed();

                expect(result.scalar).toBe("Hello, World!");
                expect(result.list).toEqual([1, 2, 3]);
                expect(result.nested.value).toBe("nested");
                expect(result.nested.items).toEqual(["a", "b", "c"]);
            });

            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.complex.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/complex", {
                        operationFilesGlob: "root/with-args/*.ts",
                        typeFilesGlob: "root/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const result = await sdk.query.rootWithArgsMixed({
                    arg1: "Hello, World!",
                    arg2: 1,
                    arg3: true,
                    arg4: ["a", "b", "c"],
                })();

                expect(result.scalar).toBe("Hello, World!");
                expect(result.list).toEqual([1, 1, 1]);
                expect(result.nested.value).toBe(true);
                expect(result.nested.items).toEqual(["a", "b", "c"]);
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.complex.root").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/complex", {
                            operationFilesGlob: "root/*.ts",
                            typeFilesGlob: "root/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const mixed = sdk.query.rootMixed().$lazy;

                    const result = await mixed();
                    expect(result.scalar).toBe("Hello, World!");
                    expect(result.list).toEqual([1, 2, 3]);
                    expect(result.nested.value).toBe("nested");
                    expect(result.nested.items).toEqual(["a", "b", "c"]);
                });

                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.complex.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/complex", {
                            operationFilesGlob: "root/with-args/*.ts",
                            typeFilesGlob: "root/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const mixed = sdk.query.rootWithArgsMixed({
                        arg1: _,
                        arg2: _,
                        arg3: _,
                        arg4: _,
                    })().$lazy;

                    const result = await mixed({ arg1: "Hello, World!", arg2: 1, arg3: true, arg4: ["a", "b", "c"] });
                    expect(result.scalar).toBe("Hello, World!");
                    expect(result.list).toEqual([1, 1, 1]);
                    expect(result.nested.value).toBe(true);
                    expect(result.nested.items).toEqual(["a", "b", "c"]);
                });
            });
        });
        describe("In objects", () => {
            test("No args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.complex.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/complex", {
                        operationFilesGlob: "in-obj/*.ts",
                        typeFilesGlob: "in-obj/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const result = await sdk.query.inObjMixed();

                expect(result.result.scalar).toBe("Hello, World!");
                expect(result.result.list).toEqual([1, 2, 3]);
                expect(result.result.nested.value).toBe("nested");
                expect(result.result.nested.items).toEqual(["a", "b", "c"]);
            });

            test("With args", async () => {
                const _sdk = (await import("./tests/.sdks/tests.complex.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./tests/complex", {
                        operationFilesGlob: "in-obj/with-args/*.ts",
                        typeFilesGlob: "in-obj/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const result = await sdk.query.inObjWithArgsMixed({
                    arg1: "Hello, World!",
                    arg2: 1,
                    arg3: true,
                    arg4: ["a", "b", "c"],
                })();
                expect(result.result.scalar).toBe("Hello, World!");
                expect(result.result.list).toEqual([1, 1, 1]);
                expect(result.result.nested.value).toBe(true);
                expect(result.result.nested.items).toEqual(["a", "b", "c"]);
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.complex.in-obj").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/complex", {
                            operationFilesGlob: "in-obj/*.ts",
                            typeFilesGlob: "in-obj/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const mixed = sdk.query.inObjMixed().$lazy;

                    const result = await mixed();
                    expect(result.result.scalar).toBe("Hello, World!");
                    expect(result.result.list).toEqual([1, 2, 3]);
                    expect(result.result.nested.value).toBe("nested");
                    expect(result.result.nested.items).toEqual(["a", "b", "c"]);
                });

                test("With args", async () => {
                    const _sdk = await import("./tests/.sdks/tests.complex.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./tests/complex", {
                            operationFilesGlob: "in-obj/with-args/*.ts",
                            typeFilesGlob: "in-obj/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const mixed = sdk.query.inObjWithArgsMixed({
                        arg1: _,
                        arg2: _,
                        arg3: _,
                        arg4: _,
                    })().$lazy;

                    const result = await mixed({ arg1: "Hello, World!", arg2: 1, arg3: true, arg4: ["a", "b", "c"] });
                    expect(result.result.scalar).toBe("Hello, World!");
                    expect(result.result.list).toEqual([1, 1, 1]);
                    expect(result.result.nested.value).toBe(true);
                    expect(result.result.nested.items).toEqual(["a", "b", "c"]);
                });
            });
        });
    });
});
