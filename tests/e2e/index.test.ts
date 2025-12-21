import { describe, beforeAll, afterAll, beforeEach, test, expect } from "bun:test";
import path from "path";
import { tmpdir } from "os";
import { initializeAndCompile } from "../../packages/dev/src/commands/shared";
import { makeGraphQLHandler } from "../../packages/dev/src/util";

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

    let { ctxFile, gqlSchema, writeSdkOut } = await initializeAndCompile(
        {
            dir,
            port: 4000,
            pretty: false,
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
    const graphqlHandler = makeGraphQLHandler(
        gqlSchema,
        async (req: Request): Promise<any> => ({
            headers: req.headers,
            ...(await ctx({
                headers: req.headers as any,
            })),
        }),
    );

    await writeSdkOut();

    const configureSdkWithHandler = async (sdk: any) => {
        sdk.init({
            fetcher: async (init: string | URL | Request, options?: RequestInit) => {
                return await graphqlHandler(new Request(init as string, options));
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

    describe("Query scalar root fields", () => {
        test("Without arguments", async () => {
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

        test("With arguments", async () => {
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
    });

    describe("Query scalar fields in objects", () => {
        test("Without arguments", async () => {
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

        test("With arguments", async () => {
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

            expect(string.string).toBe("Hello, World!");
            expect(number.number).toBe(100);
            expect(bool.boolean).toBe(true);
        });
    });
});
