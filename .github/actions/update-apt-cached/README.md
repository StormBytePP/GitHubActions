# update-apt-cached

Composite action that **refreshes and caches APT package indexes** on Linux.
It does **not** install packages.

Designed for a single **warmup job** in a workflow. Other Linux jobs (via
`install-cached` or equivalent) restore the same cache and can skip
`apt-get update`.

On non-Linux runners this action is a no-op.

## Inputs

| Name            | Required | Default      | Description |
|-----------------|----------|--------------|-------------|
| `cache-key`     | No       | `apt-lists`  | Base cache key. **Empty string disables caching** (full bypass: no restore, no update, no save). |
| `rotate-weekly` | No       | `true`       | If `true`, append the UTC ISO week (`YYYY-Www`) to the key so indexes rotate automatically. |

### Cache key examples

| `cache-key`   | `rotate-weekly` | Resulting key           |
|---------------|-----------------|-------------------------|
| `apt-lists`   | `true`          | `apt-lists-2026-W34`    |
| `apt-lists`   | `false`         | `apt-lists`             |
| `""` (empty)  | any             | *bypass – no cache*     |

## Behavior

1. **Resolve key**  
   - Empty `cache-key` → exit early (bypass).  
   - Otherwise build key and directory under `$HOME/apt-cache/<key>/lists`.

2. **Restore**  
   - `actions/cache/restore` for that path/key.

3. **Seed or update**  
   - If cached files look usable (`*_Packages` present) → copy into `/var/lib/apt/lists` and **skip** `apt-get update`.  
   - Otherwise run `apt-get update` and copy indexes into the cache directory.

4. **Save**  
   - Only when there was no cache hit **and** lists were regenerated.

Sets `APT_LISTS_FRESH=1` in the environment when lists were handled in this job (useful if later steps in the **same** job also touch APT).

## Typical workflow layout

```text
checkout-bootstrap          (submodules)
apt-bootstrap               (this action – lists only)
        │
        ├─ build-linux   needs: [checkout-bootstrap, apt-bootstrap]
        ├─ docs          needs: [checkout-bootstrap, apt-bootstrap]
        ├─ build-macos   needs: [checkout-bootstrap]
        └─ build-windows needs: [checkout-bootstrap]
```

macOS/Windows do not wait on APT warmup.

## Usage example

### Warmup job

```yaml
jobs:
  apt-bootstrap:
    runs-on: ubuntu-latest
    permissions:
      actions: write
      contents: read
    steps:
      - name: Warm APT package indexes
        uses: stormbytepp/githubactions/.github/actions/update-apt-cached@master
        with:
          cache-key: apt-lists
          rotate-weekly: true
```

### Consumer jobs

Must use the **same** `cache-key` (and weekly rotation settings) when restoring lists—typically inside `install-cached`—so they hit the cache written by the warmup job.

```yaml
  build-linux:
    needs: [checkout-bootstrap, apt-bootstrap]
    runs-on: ubuntu-latest
    steps:
      # install-cached / install-toolchain should restore the same lists key
      - uses: stormbytepp/githubactions/.github/actions/install-cached@master
        with:
          packages: nasm yasm
          cache-key: apt-lists   # same base as warmup
```

### Bypass (no shared lists cache)

```yaml
- uses: stormbytepp/githubactions/.github/actions/update-apt-cached@master
  with:
    cache-key: ""
```

Then every job updates APT on its own (parallel, uncoordinated).

## Manual invalidation

Delete matching cache entries from the repo **Actions → Caches** UI (or leave weekly rotation to expire the key). No code change required.

## Required permissions

The job that **saves** the cache needs:

```yaml
permissions:
  actions: write
  contents: read
```

## External actions used

- `actions/cache/restore@v4`
- `actions/cache/save@v4`

## License

This repository is licensed under the **MIT License**.  
See [`LICENSE.txt`](LICENSE.txt) at the repository root for the full text.
