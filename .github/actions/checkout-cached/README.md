# Checkout Cached

Composite GitHub Action that checks out a repository and **caches git submodules by commit SHA**.

Parent repository checkout is always done with [`actions/checkout@v4`](https://github.com/actions/checkout). Submodules are initialized separately and restored from the Actions cache when the recorded gitlink SHAs match.

## Author

David C. Manuelda  
[StormByte@gmail.com](mailto:StormByte@gmail.com)

## Branding

| Property | Value      |
|----------|------------|
| Icon     | `download` |
| Color    | `blue`     |

## Inputs

| Name                  | Required | Default            | Description |
|-----------------------|----------|--------------------|-------------|
| `fetch-depth`         | No       | `"0"`              | History depth for the parent repository **and every submodule**, recursively (`0` = full history). Use `1` for CI builds that only need the pinned commits. |
| `submodules`          | No       | `"recursive"`      | `false`, `true`, or `recursive`. If `false`, behaves like a normal checkout without submodule handling. |
| `token`               | No       | `${{ github.token }}` | Token used for parent checkout and submodule fetch (needed for private submodules). |
| `persist-credentials` | No       | `"true"`           | Persist credentials for later git operations in the job. |
| `cache-key-prefix`    | No       | `"git-submodules"` | Prefix for the Actions cache key. |
| `path`                | No       | `"."`              | Relative path under `$GITHUB_WORKSPACE` where the repository is placed. |

## Behavior

1. Checks out the **parent** repository with `submodules: false`.
2. If `submodules` is not `false` and `.gitmodules` exists:
   - Collects submodule paths from `.gitmodules`.
   - Builds a deterministic cache key from the cache format version, `fetch-depth` and the **gitlink SHAs** in the current parent commit (`git ls-tree`).
   - Restores the Git modules directory and each submodule working tree from cache (exact key only).
   - Runs `git submodule sync` + `git submodule update --init [--recursive]`, passing `--depth <fetch-depth>` when it is positive (Git forwards it to nested submodules) or `--no-recommend-shallow` when it is `0`.
   - On a cache **miss**, saves the submodule modules + working trees to the Actions cache.

When the parent commit points at the same submodule SHAs as a previous run, submodule clone time is largely avoided.

## Usage

```yaml
permissions:
  contents: read
  actions: write   # required to save caches

steps:
  - name: Checkout repository and submodules
    uses: stormbytepp/githubactions/.github/actions/checkout-cached@master
    with:
      fetch-depth: 0
      submodules: recursive
```

### Without submodules

```yaml
  - uses: stormbytepp/githubactions/.github/actions/checkout-cached@master
    with:
      submodules: false
```

### Custom cache prefix

```yaml
  - uses: stormbytepp/githubactions/.github/actions/checkout-cached@master
    with:
      submodules: recursive
      cache-key-prefix: my-project-submodules
```

## Notes

- Cache key changes only when **submodule commits** recorded in the parent tree change, when `fetch-depth` changes, or when the cache format version is bumped—not on every workflow run. Shallow and full-history caches never restore into each other; pruning only touches caches with the same format and depth.
- Submodules are always checked out at the commits pinned by their parent (never `--remote`). With a positive depth, Git clones the default branch shallowly and, if the pinned commit is not inside that window, fetches the pinned SHA directly with the same depth (GitHub allows this).
- Fallback: if the server refuses the direct SHA fetch, the action logs a warning, unshallows the repositories already cloned under that one first-level submodule and retries it with full history. Other submodules keep the requested depth.
- Depth is counted from the fetched commit, so for `fetch-depth > 1` a pinned commit fetched through the default branch may have fewer than `fetch-depth` commits of local history. `fetch-depth: 1` always yields exactly the pinned commit.
- Both `.git/modules` and the submodule working directories are cached so a hit does not need a full re-clone.
- Nested submodules are fetched when `submodules: recursive`. The cache key is derived from first-level gitlinks in the parent commit.
- Callers should grant `actions: write` (or equivalent) so `actions/cache/save` can store a new entry on miss.
- Private submodules require a `token` with access to those repositories.

## External actions used

- `actions/checkout@v4`
- `actions/cache/restore@v4`
- `actions/cache/save@v4`

## License

This repository is licensed under the **MIT License**.  
See [`LICENSE.txt`](LICENSE.txt) at the repository root for the full text.
