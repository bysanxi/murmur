import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Debug installs live under target/debug/widgets/@murmur.* and are only
// created once by the app. Mirror the repo starters over them on every
// `tauri dev` so edits in resources/widgets/starter land without a reinstall.
const starters = [
  { id: "@murmur.pond", folder: "pond" },
  { id: "@murmur.denghua", folder: "denghua" },
  { id: "@murmur.radio", folder: "radio" },
];

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

async function listFiles(root) {
  const out = [];
  async function walk(dir, rel = "") {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), next);
      } else if (entry.isFile()) {
        out.push(next);
      }
    }
  }
  await walk(root);
  return out;
}

async function syncWidget(workspaceRoot, { id, folder }) {
  const source = path.join(
    workspaceRoot,
    "resources/widgets/starter",
    folder,
  );
  const destination = path.join(
    workspaceRoot,
    "target/debug/widgets",
    id,
  );

  if (!(await isDirectory(source))) {
    throw new Error(`Starter source missing: ${source}`);
  }

  // First launch: the app installs starters. Creating a half-copied
  // destination here would make that installer skip the widget.
  if (!(await isDirectory(destination))) {
    return { id, skipped: true, updated: [] };
  }

  const files = await listFiles(source);
  const updated = [];
  for (const rel of files) {
    const from = path.join(source, rel);
    const to = path.join(destination, ...rel.split("/"));
    await mkdir(path.dirname(to), { recursive: true });
    let same = false;
    try {
      same = (await digest(from)) === (await digest(to));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (same) continue;
    await copyFile(from, to);
    updated.push(rel);
  }
  return { id, skipped: false, updated };
}

export async function syncStarterDev(workspaceRoot = defaultRoot) {
  const results = [];
  for (const starter of starters) {
    results.push(await syncWidget(workspaceRoot, starter));
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    const results = await syncStarterDev();
    const updated = results.flatMap((r) =>
      r.updated.map((file) => `${r.id}/${file}`),
    );
    const missing = results.filter((r) => r.skipped).map((r) => r.id);
    if (missing.length > 0) {
      console.log(
        `[starter-sync] Waiting on first-launch install for: ${missing.join(", ")}`,
      );
    }
    console.log(
      `[starter-sync] ${updated.length} file(s) updated; starters match source.`,
    );
    if (updated.length > 0) {
      for (const file of updated) console.log(`  · ${file}`);
    }
  } catch (error) {
    console.error("[starter-sync] Failed; development startup stopped.", error);
    process.exitCode = 1;
  }
}
