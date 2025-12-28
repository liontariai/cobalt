import { describe, beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
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

    let { ctxFile, gqlSchema, writeSdkOut, writeSchemaOut } = await initializeAndCompile(
        {
            dir,
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
                const tmpout = path.join(tmpdir(), crypto.randomUUID() + ".ts");
                await Bun.write(
                    Bun.file(tmpout),
                    entrypoint.replace('"@cobalt27/runtime"', `"${Bun.resolveSync("@cobalt27/runtime", process.cwd())}"`),
                );
                return tmpout;
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
                const _sdk = (await import("./operations/.sdks/operations.scalars.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/scalars", {
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
                const _sdk = (await import("./operations/.sdks/operations.scalars.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/scalars", {
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
                    const _sdk = (await import("./operations/.sdks/operations.scalars.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./operations/scalars", {
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
                    const _sdk = await import("./operations/.sdks/operations.scalars.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/scalars", {
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
                const _sdk = (await import("./operations/.sdks/operations.scalars.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/scalars", {
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
                const _sdk = (await import("./operations/.sdks/operations.scalars.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/scalars", {
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
                    const _sdk = await import("./operations/.sdks/operations.scalars.in-obj").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/scalars", {
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
                    const _sdk = await import("./operations/.sdks/operations.scalars.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/scalars", {
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

    describe("Lists of Scalars", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./operations/.sdks/operations.lists.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/lists", {
                        operationFilesGlob: "root/*.ts",
                        typeFilesGlob: "root/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.rootString;
                const number = await sdk.query.rootNumber;
                const bool = await sdk.query.rootBoolean;

                expect(string).toEqual(["Hello", "World", "!"]);
                expect(number).toEqual([1, 2, 3, 4, 5]);
                expect(bool).toEqual([true, false, true]);
            });
            test("With args", async () => {
                const _sdk = (await import("./operations/.sdks/operations.lists.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/lists", {
                        operationFilesGlob: "root/with-args/*.ts",
                        typeFilesGlob: "root/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.rootWithArgsString({
                    arg: ["Hello", "World", "!"],
                });

                expect(string).toEqual(["Hello", "World", "!"]);
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./operations/.sdks/operations.scalars.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./operations/scalars", {
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
                    const _sdk = await import("./operations/.sdks/operations.lists.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/lists", {
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

                    expect(await string({ arg: ["Hello", "World", "!"] })).toEqual(["Hello", "World", "!"]);
                });
            });
        });
        describe("In objects", () => {
            test("No args", async () => {
                const _sdk = (await import("./operations/.sdks/operations.lists.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/lists", {
                        operationFilesGlob: "in-obj/*.ts",
                        typeFilesGlob: "in-obj/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.inObjString();
                const number = await sdk.query.inObjNumber();
                const bool = await sdk.query.inObjBoolean();

                expect(string.strings).toEqual(["Hello", "World", "!"]);
                expect(number.numbers).toEqual([1, 2, 3, 4, 5]);
                expect(bool.booleans).toEqual([true, false, true]);
            });
            test("With args", async () => {
                const _sdk = (await import("./operations/.sdks/operations.lists.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/lists", {
                        operationFilesGlob: "in-obj/with-args/*.ts",
                        typeFilesGlob: "in-obj/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const string = await sdk.query.inObjWithArgsString({ arg: ["Hello", "World", "!"] })();

                expect(string.strings).toEqual(["Hello", "World", "!"]);
            });
            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./operations/.sdks/operations.lists.in-obj").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./operations/lists", {
                            operationFilesGlob: "in-obj/*.ts",
                            typeFilesGlob: "in-obj/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const string = sdk.query.inObjString().$lazy;
                    const number = sdk.query.inObjNumber().$lazy;
                    const bool = sdk.query.inObjBoolean().$lazy;

                    expect(await string()).toEqual({ strings: ["Hello", "World", "!"] });
                    expect(await number()).toEqual({ numbers: [1, 2, 3, 4, 5] });
                    expect(await bool()).toEqual({ booleans: [true, false, true] });
                });
                test("With args", async () => {
                    const _sdk = await import("./operations/.sdks/operations.lists.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/lists", {
                            operationFilesGlob: "in-obj/with-args/*.ts",
                            typeFilesGlob: "in-obj/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const string = sdk.query.inObjWithArgsString({ arg: _ })().$lazy;

                    expect(await string({ arg: ["Hello", "World", "!"] })).toEqual({ strings: ["Hello", "World", "!"] });
                });
            });
        });
    });

    describe("Unions", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./operations/.sdks/operations.unions.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/unions", {
                        operationFilesGlob: "root/*.ts",
                        typeFilesGlob: "root/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const simple = await sdk.query.rootSimple;

                expect(simple).toBe("Hello, World!");
            });
            test("With args", async () => {
                const _sdk = (await import("./operations/.sdks/operations.unions.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/unions", {
                        operationFilesGlob: "root/with-args/*.ts",
                        typeFilesGlob: "root/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const stringResult = await sdk.query.rootWithArgsSimple({ arg: "Hello" });
                const numberResult = await sdk.query.rootWithArgsSimple({ arg: 42 });

                expect(stringResult).toBe("Hello");
                expect(numberResult).toBe(42);
            });

            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = (await import("./operations/.sdks/operations.unions.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./operations/unions", {
                            operationFilesGlob: "root/*.ts",
                            typeFilesGlob: "root/*.ts",
                        })
                    )(_sdk);
                    if (!_sdk) return;

                    const sdk = _sdk;

                    const simple = sdk.query.rootSimple.$lazy;

                    expect(await simple()).toBe("Hello, World!");
                });
                test("With args", async () => {
                    const _sdk = await import("./operations/.sdks/operations.unions.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/unions", {
                            operationFilesGlob: "root/with-args/*.ts",
                            typeFilesGlob: "root/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const simple = sdk.query.rootWithArgsSimple({ arg: _ }).$lazy;

                    expect(await simple({ arg: "Hello" })).toBe("Hello");
                    expect(await simple({ arg: 42 })).toBe(42);
                });
            });
        });
        describe("In objects", () => {
            test("No args", async () => {
                const _sdk = (await import("./operations/.sdks/operations.unions.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/unions", {
                        operationFilesGlob: "in-obj/*.ts",
                        typeFilesGlob: "in-obj/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const simple = await sdk.query.inObjSimple();

                expect(simple.value).toBe("Hello, World!");
            });
            test("With args", async () => {
                const _sdk = (await import("./operations/.sdks/operations.unions.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/unions", {
                        operationFilesGlob: "in-obj/with-args/*.ts",
                        typeFilesGlob: "in-obj/with-args/*.ts",
                    })
                )(_sdk);
                if (!_sdk) return;

                const sdk = _sdk;

                const stringResult = await sdk.query.inObjWithArgsSimple({ arg: "Hello" })();
                const numberResult = await sdk.query.inObjWithArgsSimple({ arg: 42 })();

                expect(stringResult.value).toBe("Hello");
                expect(numberResult.value).toBe(42);
            });
            describe("with $lazy", () => {
                test("No args", async () => {
                    const _sdk = await import("./operations/.sdks/operations.unions.in-obj").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/unions", {
                            operationFilesGlob: "in-obj/*.ts",
                            typeFilesGlob: "in-obj/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const simple = sdk.query.inObjSimple().$lazy;

                    expect((await simple()).value).toBe("Hello, World!");
                });
                test("With args", async () => {
                    const _sdk = await import("./operations/.sdks/operations.unions.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/unions", {
                            operationFilesGlob: "in-obj/with-args/*.ts",
                            typeFilesGlob: "in-obj/with-args/*.ts",
                        })
                    )(_sdk?.default);
                    if (!_sdk) return;

                    const sdk = _sdk.default;
                    const _ = _sdk._;

                    const simple = sdk.query.inObjWithArgsSimple({ arg: _ })().$lazy;

                    expect((await simple({ arg: "Hello" })).value).toBe("Hello");
                    expect((await simple({ arg: 42 })).value).toBe(42);
                });
            });
        });
    });

    describe("Enums", () => {
        describe("Root fields", () => {
            test("No args", async () => {
                const _sdk = (await import("./operations/.sdks/operations.enums.root").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/enums", {
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
                const _sdk = (await import("./operations/.sdks/operations.enums.root.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/enums", {
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
                    const _sdk = (await import("./operations/.sdks/operations.enums.root").catch(console.error))?.default;
                    (
                        await makeHandlerFromDir("./operations/enums", {
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
                    const _sdk = await import("./operations/.sdks/operations.enums.root.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/enums", {
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
                const _sdk = (await import("./operations/.sdks/operations.enums.in-obj").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/enums", {
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
                const _sdk = (await import("./operations/.sdks/operations.enums.in-obj.with-args").catch(console.error))?.default;
                (
                    await makeHandlerFromDir("./operations/enums", {
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
                    const _sdk = await import("./operations/.sdks/operations.enums.in-obj").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/enums", {
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
                    const _sdk = await import("./operations/.sdks/operations.enums.in-obj.with-args").catch(console.error);
                    (
                        await makeHandlerFromDir("./operations/enums", {
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

    describe("Mutation root fields", () => {
        test("With arguments", async () => {
            const _sdk = (await import("./operations/.sdks/operations.mutations.root").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/mutations", {
                    operationFilesGlob: "root/*.ts",
                    typeFilesGlob: "root/*.ts",
                })
            )(_sdk);
            if (!_sdk) return;

            const sdk = _sdk;

            const result = await sdk.mutation.rootString({
                arg: "Hello, World!",
            });

            expect(result).toBe("Hello, World!");
        });
    });

    describe("Mutation fields in objects", () => {
        test("With arguments", async () => {
            const _sdk = (await import("./operations/.sdks/operations.mutations.in-obj").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/mutations", {
                    operationFilesGlob: "in-obj/*.ts",
                    typeFilesGlob: "in-obj/*.ts",
                })
            )(_sdk);
            if (!_sdk) return;

            const sdk = _sdk;

            const result = await sdk.mutation.inObjString({
                arg: "Hello, World!",
            })();

            expect(result.result).toBe("Hello, World!");
        });
    });

    describe("Subscription root fields", () => {
        test("Without arguments", async () => {
            const _sdk = (await import("./operations/.sdks/operations.subscriptions.root").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/subscriptions", {
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
    });

    describe("Subscription fields in objects", () => {
        test("Without arguments", async () => {
            const _sdk = (await import("./operations/.sdks/operations.subscriptions.in-obj").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/subscriptions", {
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
    });

    describe("Query nested object root fields", () => {
        test("Without arguments", async () => {
            const _sdk = (await import("./operations/.sdks/operations.nested.root").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/nested", {
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

        test("With arguments", async () => {
            const _sdk = (await import("./operations/.sdks/operations.nested.root.with-args").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/nested", {
                    operationFilesGlob: "root/with-args/*.ts",
                    typeFilesGlob: "root/*.ts",
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
    });

    describe("Query nested object fields in objects", () => {
        test("Without arguments", async () => {
            const _sdk = (await import("./operations/.sdks/operations.nested.in-obj").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/nested", {
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

        test("With arguments", async () => {
            const _sdk = (await import("./operations/.sdks/operations.nested.in-obj.with-args").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/nested", {
                    operationFilesGlob: "in-obj/with-args/*.ts",
                    typeFilesGlob: "in-obj/*.ts",
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
    });

    describe("Query nullable root fields", () => {
        test("Null field", async () => {
            const _sdk = (await import("./operations/.sdks/operations.nullable.root").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/nullable", {
                    operationFilesGlob: "root/*.ts",
                    typeFilesGlob: "root/*.ts",
                })
            )(_sdk);
            if (!_sdk) return;

            const sdk = _sdk;

            const optional = await sdk.query.rootOptional;

            expect(optional).toBeNull();
        });
    });

    describe("Query nullable fields in objects", () => {
        test("Null field", async () => {
            const _sdk = (await import("./operations/.sdks/operations.nullable.in-obj").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/nullable", {
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
    });

    describe("Query complex mixed root fields", () => {
        test("With arguments", async () => {
            const _sdk = (await import("./operations/.sdks/operations.complex.root").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/complex", {
                    operationFilesGlob: "root/*.ts",
                    typeFilesGlob: "root/*.ts",
                })
            )(_sdk);
            if (!_sdk) return;

            const sdk = _sdk;

            const result = await sdk.query.rootMixed({
                arg: "test",
            })();

            expect(result.scalar).toBe("test");
            expect(result.list).toEqual([1, 2, 3]);
            expect(result.nested.value).toBe("nested");
            expect(result.nested.items).toEqual(["a", "b", "c"]);
        });
    });

    describe("Query complex mixed fields in objects", () => {
        test("With arguments", async () => {
            const _sdk = (await import("./operations/.sdks/operations.complex.in-obj").catch(console.error))?.default;
            (
                await makeHandlerFromDir("./operations/complex", {
                    operationFilesGlob: "in-obj/*.ts",
                    typeFilesGlob: "in-obj/*.ts",
                })
            )(_sdk);
            if (!_sdk) return;

            const sdk = _sdk;

            const result = await sdk.query.inObjMixed({
                arg: "test",
            })();

            expect(result.result.scalar).toBe("test");
            expect(result.result.list).toEqual([1, 2, 3]);
            expect(result.result.nested.value).toBe("nested");
            expect(result.result.nested.items).toEqual(["a", "b", "c"]);
        });
    });
});
