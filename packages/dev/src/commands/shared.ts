import fs from "fs";
import path from "path";
import { $ } from "bun";
import prettier from "prettier";
import { Generator } from "@cobalt27/generate";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLGenerator, Flavors } from "@samarium.sdk/make";
import type {
    OperationMeta,
    TypeMeta,
} from "@cobalt27/generate/src/collector/types";

const cwd = process.cwd();

export const resolve = (p: string, check = true) => {
    const resolved = path.resolve(cwd, p);
    if (check && !fs.existsSync(resolved)) {
        return undefined;
    }
    return resolved;
};

export const createDirectory = (dirPath: string) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📁 Created directory: ${path.relative(cwd, dirPath)}`);
    }
};

export const writeFile = (filePath: string, content: string) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content);
    console.log(`📄 Created file: ${path.relative(cwd, filePath)}`);
};

export const removeFile = (filePath: string) => {
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        // console.log(`🗑️ Removed file: ${filePath}`);
    }
};

export const findOperationsDir = (dir: string) => {
    const searchDirs = [
        dir || "operations",
        `src/${dir || "operations"}`,
        `server/${dir || "operations"}`,
        `src/server/${dir || "operations"}`,
    ];

    const operationsDir = searchDirs.find((dir) => resolve(dir));
    return operationsDir;
};
export const findAuthFile = (operationsDir: string) => {
    const searchDirs = [
        path.join(operationsDir, "..", "auth.ts"),
        path.join(operationsDir, "..", "auth.prod.ts"),
        path.join(operationsDir, "..", "auth.dev.ts"),
    ];

    const authFile = searchDirs.find((dir) => resolve(dir));
    return authFile;
};

export const initializeAndCompile = async (
    options: {
        dir: string;
        pretty: boolean;
        sdkOut: string;
        port: number;
        operationFilesGlob?: string;
        typeFilesGlob?: string;
        onFileCollected?: (
            file: string,
            meta: OperationMeta | TypeMeta,
            fileType: "operation" | "type" | "union",
        ) => Promise<void>;
        $$typesSymbol?: string;
    },
    initCobaltAuthFn?: (authConfigFile: string) => Promise<void>,
    silent: boolean = false,
    overrideWriteOuts?: {
        writeSchemaOut?: (outpath: string, schema: string) => Promise<string>;
        writeTypesOut?: (
            outpath: string,
            tsTypes: Record<string, string>,
        ) => Promise<string>;
        writeSdkOut?: (outpath: string, sdk: string) => Promise<string>;
        writeResolversOut?: (
            outpath: string,
            entrypoint: string,
        ) => Promise<string>;
    },
) => {
    const searchDirs = [
        options.dir || "operations",
        `src/${options.dir || "operations"}`,
        `server/${options.dir || "operations"}`,
        `src/server/${options.dir || "operations"}`,
    ];

    const operationsDir = searchDirs.find((dir) => resolve(dir));
    if (!silent) {
        console.log(`🔍 Found operations in: ${operationsDir}`);
    }

    if (!operationsDir) {
        console.error(
            `Directory (${options.dir}) not found, could not find operations.`,
        );
        console.error(`Looked in: ${searchDirs.join("\n")}`);
        process.exit(1);
    }

    let ctxFile = resolve(path.join(operationsDir, "..", "ctx.ts"));
    let ctxDir: string = path.join(operationsDir, "..");
    const searchCtxDirs = [];
    let tries = 0;
    if (!ctxFile) {
        do {
            console.log(
                `Looking for ctx.ts in: ${path.join(ctxDir, "ctx.ts")}`,
            );
            tries++;
            ctxDir = path.resolve(ctxDir, "..");
            searchCtxDirs.push(ctxDir);
            ctxFile = resolve(path.join(ctxDir, "ctx.ts"));
            if (ctxFile) break;
        } while (tries < 10);
    }

    if (!ctxFile) {
        console.error(`The ctx.ts file is mandatory!`);
        console.error(
            `Must be in: ${path.join(operationsDir, "..", "ctx.ts")} or in one of the parent directories: \n${searchCtxDirs.join("\n\t")}`,
            `You can create a ctx.ts file by running:`,
            `bunx @cobalt27/dev init`,
        );
        process.exit(1);
    }
    const authFile =
        resolve(path.join(operationsDir, "..", "auth.ts")) ||
        resolve(path.join(operationsDir, "..", "auth.prod.ts")) ||
        resolve(path.join(operationsDir, "..", "auth.dev.ts")) ||
        null;

    if (authFile && initCobaltAuthFn) {
        if (!silent) {
            console.log(`🔑 Detected auth.ts file, initializing Cobalt Auth`);
            console.log(`Initializing Cobalt Auth using ${authFile}`);
        }
        await initCobaltAuthFn(authFile);
    } else if (!authFile && initCobaltAuthFn) {
        if (!silent) {
            console.log("No `auth.ts` found. No authentication configured.");
        }
    }

    const t1 = performance.now();
    const generator = new Generator();

    let { schema, entrypoint, tsTypes } = await generator.generate(
        operationsDir,
        {
            operationFilesGlob: options.operationFilesGlob,
            typeFilesGlob: options.typeFilesGlob,
            onFileCollected: options.onFileCollected,
            $$typesSymbol: options.$$typesSymbol,
        },
    );

    const t2 = performance.now();
    if (!silent) {
        console.log(`🚀  Generator took ${(t2 - t1).toFixed(2)} ms`);
    }

    if (options.pretty) {
        try {
            schema = await prettier.format(schema, { parser: "graphql" });
        } catch (e) {
            console.error("Failed to format schema, skipping pretty printing");
        }
    }

    let schemaOutpath = resolve("./.cobalt/schema.graphql", false)!;
    let writeSchemaOut = async () => {
        await Bun.write(Bun.file(schemaOutpath), schema);
        return schemaOutpath;
    };
    if (overrideWriteOuts?.writeSchemaOut) {
        writeSchemaOut = async () => {
            await overrideWriteOuts.writeSchemaOut!(schemaOutpath, schema);
            return schemaOutpath;
        };
    }

    let resolversPath = resolve("./.cobalt/resolvers.ts", false)!;
    if (overrideWriteOuts?.writeResolversOut) {
        resolversPath =
            (await overrideWriteOuts.writeResolversOut(
                resolversPath,
                entrypoint,
            )) ?? resolversPath;
    } else {
        await Bun.write(Bun.file(resolversPath), entrypoint);
    }

    const writeTypesOut = async () => {
        for (const [fname, fcontent] of Object.entries(tsTypes)) {
            await Bun.write(
                Bun.file(resolve(`./.cobalt/$$types/${fname}.ts`, false)!),
                fcontent,
            );
        }
    };

    let gqlSchema;
    try {
        if (require.cache[resolversPath]) {
            delete require.cache[resolversPath];
        }

        gqlSchema = makeExecutableSchema({
            typeDefs: schema,
            resolvers: {
                ...require(resolversPath),
            },
        });

        const t3 = performance.now();

        const sdk = await new GraphQLGenerator.Generator(
            Flavors.GraphQL.default,
        ).generate({
            schema: gqlSchema,
            options: {},
            authConfig: {
                headerName: "Authorization",
            },
        });

        const t4 = performance.now();
        if (!silent) {
            console.log(`🚀  SDK took ${(t4 - t3).toFixed(2)} ms`);
        }

        const sdkout = options.sdkOut ?? resolve("./.cobalt/sdk.ts", false)!;

        const port = options.port || 4000;

        const sdkContent = sdk
            .replaceAll("[AUTH_HEADER_NAME]", "Authorization")
            .replaceAll("[ENDPOINT]", `http://localhost:${port}/graphql`);

        let writeSdkOut = async () => {
            await Bun.write(Bun.file(sdkout), sdkContent);
            return sdkout;
        };
        if (overrideWriteOuts?.writeSdkOut) {
            writeSdkOut = async () => {
                return await overrideWriteOuts.writeSdkOut!(sdkout, sdkContent);
            };
        }

        return {
            operationsDir,
            ctxFile,
            authFile,
            schema,
            gqlSchema,
            entrypoint,
            tsTypes,
            sdkContent,
            writeSchemaOut,
            writeTypesOut,
            writeSdkOut,
        };
    } catch (e) {
        console.error("Failed to generate schema, skipping", e);
        await writeSchemaOut();
        console.error(
            `Written INVALID schema to ./.cobalt/schema.graphql, skipping sdk generation`,
        );
        throw e;
    }
};

export const readManifestFromBundledServer = async (serverPath: string) => {
    const manifest = await $`bun run ${serverPath}`
        .env({
            OPENAUTH_ISSUER: "placeholder",
            COBALT_DEV_RETURN_MANIFEST: "true",
        })
        .nothrow()
        .quiet();

    const manifestOutput = manifest?.stdout?.toString();
    if (!manifestOutput || !manifestOutput.includes("=== BUILD MANIFEST ===")) {
        throw new Error("No manifest output");
    }
    const manifestString = manifestOutput.substring(
        manifestOutput.indexOf("=== BUILD MANIFEST ===\n") +
            "=== BUILD MANIFEST ===\n".length,
        manifestOutput.indexOf("=== END BUILD MANIFEST ===\n"),
    );

    return JSON.parse(manifestString) as {
        cobalt: {
            version: string;
            build: {
                operationsDir: string;
            };
            cobaltAuth?: {
                version: string;
            };
        };
    };
};
