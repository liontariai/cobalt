import fs from "fs";
import path from "path";
import { Generator } from "@cobalt27/generate";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLGenerator, Flavors } from "@samarium.sdk/make";
import type { CobaltAuthConfig } from "@cobalt27/auth";
import prettier from "prettier";

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

export const initializeAndCompile = async (
    options: {
        dir: string;
        pretty: boolean;
        sdkOut: string;
        port: number;
    },
    silent: boolean = false,
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

    const ctxFile = resolve(path.join(operationsDir, "..", "ctx.ts"));
    if (!ctxFile) {
        console.error(`The ctx.ts file is mandatory!`);
        console.error(
            `Must be in: ${path.join(operationsDir, "..", "ctx.ts")}`,
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

    const t1 = performance.now();
    const generator = new Generator();

    let { schema, entrypoint, tsTypes } =
        await generator.generate(operationsDir);

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

    const writeSchemaOut = async () => {
        await Bun.write(
            Bun.file(resolve("./.cobalt/schema.graphql", false)!),
            schema,
        );
    };
    // const writeResolversOut = async () => {
    await Bun.write(
        Bun.file(resolve("./.cobalt/resolvers.ts", false)!),
        entrypoint,
    );
    // };

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
        gqlSchema = makeExecutableSchema({
            typeDefs: schema,
            resolvers: {
                ...require(resolve("./.cobalt/resolvers.ts", false)!),
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

        const writeSdkOut = async () => {
            Bun.write(Bun.file(sdkout), sdkContent);
        };

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
        console.error("Failed to generate schema, skipping");
        fs.writeFileSync(resolve("./.cobalt/schema.graphql", false)!, schema);
        console.error(
            `Written INVALID schema to ./.cobalt/schema.graphql, skipping sdk generation`,
        );
        throw e;
    }
};
