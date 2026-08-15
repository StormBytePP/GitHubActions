# Cache and Install APT Packages

Composite GitHub Action that installs system packages and caches them for faster subsequent runs.

- **Linux**: Installs APT packages and caches the downloaded `.deb` files deterministically.
- **Windows**: Installs packages via Chocolatey (no caching currently).

## Author

David C. Manuelda  
[StormByte@gmail.com](mailto:StormByte@gmail.com)

## Branding

| Property | Value       |
|----------|-------------|
| Icon     | `hard-drive` |
| Color    | `green`     |

## Inputs

| Name        | Required | Default | Description |
|-------------|----------|---------|-------------|
| `packages`  | Yes      | —       | Space-separated list of packages to install.<br>• Linux → APT packages<br>• Windows → Chocolatey packages |
| `cache-key` | No       | `""`    | Prefix for the cache key. If empty, caching is disabled on Linux.<br>Change this value to force a cache miss and perform a fresh download. |
| `unique`    | No       | `"true"`| If `true`, the provided `cache-key` is treated as globally unique (no hash suffix is added).<br>If `false`, a deterministic 16-character hash of the package list is appended to avoid collisions when the same prefix is reused with different package sets. |

## Behavior

### Linux
1. Computes a deterministic cache key (optionally with a package-list hash).
2. Restores previously cached `.deb` files (if any).
3. Copies restored `.deb` files into the system APT cache (`/var/cache/apt/archives`).
4. Runs `apt-get update` and downloads any missing packages + dependencies (`--download-only`).
5. Installs the requested packages using the local `.deb` files whenever possible.
6. Saves the updated cache only on a cache miss.

### Windows
Simply runs:
```powershell
choco install <packages> -y