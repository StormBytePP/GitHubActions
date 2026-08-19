# Cache and Install Packages

Composite GitHub Action that installs system packages across operating systems.

- **Linux**: APT install with optional **package-index (lists) cache** (shared with `update-apt-cached`) and optional **`.deb` cache**.
- **Windows**: Chocolatey (+ PATH helpers for common tools such as nasm/yasm).
- **macOS**: Homebrew (with fallback `llvm@N` → `llvm` when needed).

## Author

David C. Manuelda  
[StormByte@gmail.com](mailto:StormByte@gmail.com)

## Branding

| Property | Value        |
|----------|--------------|
| Icon     | `hard-drive` |
| Color    | `green`      |

## Inputs

| Name              | Required | Default      | Description |
|-------------------|----------|--------------|-------------|
| `packages`        | **Yes**  | —            | Space-separated list of packages to install (APT / Chocolatey / Homebrew names as appropriate). |
| `cache-key`       | No       | `""`         | **Linux `.deb` cache** prefix. Empty disables deb caching. Independent from lists. |
| `lists-cache-key` | No       | `apt-lists`  | **Linux APT lists** base key. Must match `update-apt-cached`. Empty disables lists restore (each job runs `apt-get update`). |
| `rotate-weekly`   | No       | `"true"`     | If `true`, append UTC ISO week (`YYYY-Www`) to `lists-cache-key` (must match `update-apt-cached`). |
| `unique`          | No       | `"true"`     | **Deb cache only.** If `true`, use `cache-key` as-is. If `false`, append a 16-character hash of the normalized package list. |

### Lists key examples

| `lists-cache-key` | `rotate-weekly` | Resulting lists key    |
|-------------------|-----------------|------------------------|
| `apt-lists`       | `true`          | `apt-lists-2026-W34`   |
| `apt-lists`       | `false`         | `apt-lists`            |
| `""`              | any             | *no lists cache*       |

## Behavior

### Linux

1. **Lists** (if `lists-cache-key` non-empty)  
   - Restore indexes from Actions cache (same key/path as `update-apt-cached`).  
   - Seed `/var/lib/apt/lists`.  
   - If usable (`*_Packages` present) → **skip** `apt-get update`.  
   - Otherwise run `apt-get update`.  
   - If `lists-cache-key` is empty → always update (bypass).

2. **Debs** (if `cache-key` non-empty)  
   - Restore `.deb` files → seed `/var/cache/apt/archives`.  
   - `apt-get install --download-only` → install.  
   - Save deb cache on miss.

3. Same-job guard: if `APT_LISTS_FRESH=1` is already set, skip update again.

### Windows

```powershell
choco install <packages> -y --no-progress
```

Adds common install dirs to `PATH` when installing `nasm` / `yasm`.

### macOS

```bash
brew install <packages>
```

## Typical CI layout

```text
apt-bootstrap          → update-apt-cached (lists only)
build-linux / docs     → needs apt-bootstrap → install-cached (restore lists, install pkgs)
```

Warmup and install must share the same `lists-cache-key` and `rotate-weekly`.

## Usage examples

### Install with shared lists + deb cache

```yaml
- name: Install packages
  uses: stormbytepp/githubactions/.github/actions/install-cached@master
  with:
    packages: 'nasm yasm'
    lists-cache-key: apt-lists    # same as update-apt-cached
    rotate-weekly: true
    cache-key: apt-nasm-yasm      # deb cache only
    unique: true
```

### Deb cache only (no shared lists)

```yaml
- uses: stormbytepp/githubactions/.github/actions/install-cached@master
  with:
    packages: 'cmake ninja'
    lists-cache-key: ""
    cache-key: build-tools-v1
```

## Notes

- Lists caching is coordinated with [**update-apt-cached**](../update-apt-cached/README.md); this action does not *write* the lists cache (the warmup job does).
- Deb caching remains per `cache-key` / package set and is independent of lists.
- Package names differ across APT, Chocolatey, and Homebrew.

## External actions used

- `actions/cache/restore@v4`
- `actions/cache/save@v4`

## License

This repository is licensed under the **MIT License**.  
See [`LICENSE.txt`](LICENSE.txt) at the repository root for the full text.
