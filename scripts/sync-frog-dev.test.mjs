import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { syncFrogDev } from "./sync-frog-dev.mjs";

const files = ["art-real.js", "art-xieyi.js", "scene.js"];

async function fixture(t, installed = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "murmur-frog-sync-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "resources/widgets/starter/pond/vendor");
  const destination = path.join(
    root,
    "target/debug/widgets/@murmur.pond/vendor",
  );
  await mkdir(source, { recursive: true });
  if (installed) await mkdir(destination, { recursive: true });
  await Promise.all(
    files.map(async (file) => {
      await writeFile(path.join(source, file), `new ${file}`);
      if (installed)
        await writeFile(path.join(destination, file), `old ${file}`);
    }),
  );
  return { root, source, destination };
}

test("syncs frog files, preserves other files, and is repeatable", async (t) => {
  const { root, destination } = await fixture(t);
  await writeFile(path.join(destination, "audio.js"), "keep audio");
  const result = await syncFrogDev(root);
  assert.deepEqual(result.updated, files);
  await Promise.all(
    files.map(async (file) => {
      assert.equal(
        await readFile(path.join(destination, file), "utf8"),
        `new ${file}`,
      );
    }),
  );
  assert.equal(
    await readFile(path.join(destination, "audio.js"), "utf8"),
    "keep audio",
  );
  assert.deepEqual((await syncFrogDev(root)).updated, []);
});

test("first launch does not create a partial installed widget", async (t) => {
  const { root, destination } = await fixture(t, false);
  assert.equal((await syncFrogDev(root)).skipped, true);
  await assert.rejects(stat(path.dirname(destination)), { code: "ENOENT" });
});

test("missing source fails before any runtime file is overwritten", async (t) => {
  const { root, source, destination } = await fixture(t);
  await rm(path.join(source, "scene.js"));
  await assert.rejects(syncFrogDev(root), { code: "ENOENT" });
  assert.equal(
    await readFile(path.join(destination, "art-real.js"), "utf8"),
    "old art-real.js",
  );
});
