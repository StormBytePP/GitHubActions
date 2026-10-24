const assert = require("node:assert/strict");
const { test } = require("node:test");
const cleanup = require("./cleanup-cache.cjs");

const key = "sccache-Windows-clang-cl-v1-build-windows";
const currentKey = `${key}-200-1`;
const current = {
  id: 2,
  key: currentKey,
  ref: "refs/heads/master",
  version: "cache-version",
  created_at: "2026-10-23T13:00:00Z"
};
const old = { ...current, id: 1, key: `${key}-100-1`, created_at: "2026-10-22T13:00:00Z" };

async function run(caches, ref = current.ref) {
  process.env.CACHE_KEY = key;
  process.env.CACHE_SAVE_KEY = currentKey;
  const deleted = [];
  const warnings = [];
  const context = { repo: { owner: "owner", repo: "repo" }, ref };
  const list = () => {};
  const github = {
    rest: {
      actions: {
        getActionsCacheList: list,
        deleteActionsCacheById: async params => deleted.push(params.cache_id)
      }
    },
    paginate: async (method, params) => {
      assert.equal(method, list);
      assert.deepEqual(params, { ...context.repo, ref, key: `${key}-`, per_page: 100 });
      return caches;
    }
  };
  await cleanup({
    github,
    context,
    core: { info: () => {}, warning: message => warnings.push(message) }
  });
  return { deleted, warnings };
}

test("deletes only older caches on the current ref", async () => {
  const result = await run([old, current]);
  assert.deepEqual(result.deleted, [old.id]);
  assert.deepEqual(result.warnings, []);
});

test("release cleanup never deletes the default branch cache", async () => {
  const release = { ...current, ref: "refs/tags/v1.0" };
  const oldRelease = { ...old, id: 3, ref: release.ref };
  const result = await run([old, oldRelease, release], release.ref);
  assert.deepEqual(result.deleted, [oldRelease.id]);
});

test("keeps all previous caches if the upload did not create a replacement", async () => {
  const result = await run([old]);
  assert.deepEqual(result.deleted, []);
  assert.equal(result.warnings.length, 1);
});

test("a same-key cache on another ref is not proof of a successful upload", async () => {
  const result = await run([old, { ...current, ref: "refs/pull/42/merge" }]);
  assert.deepEqual(result.deleted, []);
  assert.equal(result.warnings.length, 1);
});

test("keeps newer and equally old entries from concurrent runs", async () => {
  const newer = { ...current, id: 3, key: `${key}-300-1`, created_at: "2026-10-24T13:00:00Z" };
  const simultaneous = { ...current, id: 4, key: `${key}-201-1` };
  const result = await run([old, current, newer, simultaneous]);
  assert.deepEqual(result.deleted, [old.id]);
});

test("deletes older caches even when the version (content hash) differs", async () => {
  const result = await run([current, { ...old, version: "different-version" }]);
  assert.deepEqual(result.deleted, [old.id]);
});

test("does not delete matrix scopes whose keys share a prefix", async () => {
  const result = await run([current, { ...old, key: `${key}-extra-100-1` }]);
  assert.deepEqual(result.deleted, []);
});

test("keeps entries with an invalid creation timestamp", async () => {
  const result = await run([current, { ...old, created_at: "invalid" }]);
  assert.deepEqual(result.deleted, []);
});

test("rejects missing or inconsistent keys before listing caches", async () => {
  for (const saveKey of ["", "unrelated-200-1"]) {
    process.env.CACHE_KEY = key;
    process.env.CACHE_SAVE_KEY = saveKey;
    await assert.rejects(cleanup({}), /Missing or inconsistent cache keys/);
  }
});
