module.exports = async function cleanup({ github, context, core }) {
  const key = process.env.CACHE_KEY;
  const currentKey = process.env.CACHE_SAVE_KEY;
  if (!key || !currentKey || !currentKey.startsWith(`${key}-`)) {
    throw new Error("Missing or inconsistent cache keys; refusing cache cleanup");
  }

  const keyPrefix = `${key}-`;
  const caches = await github.paginate(
    github.rest.actions.getActionsCacheList,
    { ...context.repo, key: keyPrefix, ref: context.ref, per_page: 100 }
  );
  // cache/save can report success without uploading anything (for example, on a quota error).
  const current = caches.find(cache => cache.key === currentKey && cache.ref === context.ref);
  if (!current) {
    core.warning(`Cache ${currentKey} was not found on ${context.ref}; keeping previous caches`);
    return;
  }

  for (const cache of caches) {
    if (
      cache.ref === current.ref &&
      cache.version === current.version &&
      cache.key.startsWith(keyPrefix) &&
      /^\d+-\d+$/.test(cache.key.slice(keyPrefix.length)) &&
      Date.parse(cache.created_at) < Date.parse(current.created_at)
    ) {
      core.info(`Deleting old cache: ${cache.key} (id=${cache.id}, ref=${cache.ref})`);
      await github.rest.actions.deleteActionsCacheById({
        ...context.repo,
        cache_id: cache.id
      });
    }
  }
};
