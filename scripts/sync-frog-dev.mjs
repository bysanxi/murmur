import { createHash } from "node:crypto";
import { copyFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frogFiles = ["art-real.js", "art-xieyi.js", "scene.js"];
const defaultRoot = fileURLToPath(new URL("../", import.meta.url));

async function isDirectory(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function digest(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

export async function syncFrogDev(workspaceRoot = defaultRoot) {
  const source = path.join(
    workspaceRoot,
    "resources/widgets/starter/pond/vendor",
  );
  const destination = path.join(
    workspaceRoot,
    "target/debug/widgets/@murmur.pond/vendor",
  );

  // On first launch, the application's starter installer creates the widget.
  // Never create a partial widget directory: that would make it skip installation.
  if (!(await isDirectory(destination))) {
    return { skipped: true, updated: [], destination };
  }

  // Validate all source files before overwriting any runtime file.
  const sourceHashes = await Promise.all(
    frogFiles.map((file) => digest(path.join(source, file))),
  );
  const results = await Promise.all(
    frogFiles.map(async (file, index) => {
      const target = path.join(destination, file);
      let targetHash;
      try {
        targetHash = await digest(target);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (targetHash === sourceHashes[index]) return null;
      await copyFile(path.join(source, file), target);
      if ((await digest(target)) !== sourceHashes[index]) {
        throw new Error(`Frog runtime verification failed: ${target}`);
      }
      return file;
    }),
  );
  const updated = results.filter((file) => file !== null);
  return { skipped: false, updated, destination };
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    const result = await syncFrogDev();
    console.log(
      result.skipped
        ? "[frog-sync] No installed debug widget; first-launch installation will handle it."
        : `[frog-sync] ${result.updated.length} file(s) updated; all 3 frog files match source.`,
    );
  } catch (error) {
    console.error("[frog-sync] Failed; development startup stopped.", error);
    process.exitCode = 1;
  }
}
