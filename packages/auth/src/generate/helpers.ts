import path from "path";
import fs from "fs";
import packageJson from "../../package.json";

export const findNodeModulesDir = () => {
    const findPackageJson = (dir: string): string => {
        const pkgPath = path.join(dir, "package.json");
        if (fs.existsSync(pkgPath)) {
            return dir;
        } else {
            const parentDir = path.dirname(dir);
            if (parentDir === dir) {
                throw new Error("Could not find package.json");
            }
            return findPackageJson(parentDir);
        }
    };
    const projectRoot = findPackageJson(process.cwd());
    const cobaltAuthDirArr = Bun.resolveSync(
        packageJson.name,
        projectRoot,
    ).split(path.sep);

    let nodeModulesDir: string | undefined = "";
    while (nodeModulesDir !== "node_modules") {
        nodeModulesDir = cobaltAuthDirArr.pop();
        if (nodeModulesDir === undefined)
            throw new Error(
                "Could not find parent `node_modules` directory from `@cobalt27/auth` package.",
            );
    }

    const destination = [...cobaltAuthDirArr, "node_modules"].join(path.sep);
    return destination;
};
