# Cache and Install Packages

Composite GitHub Action that installs system packages across operating systems, with deterministic caching on Linux.

- **Linux**: Installs APT packages and caches the downloaded `.deb` files deterministically.
- **Windows**: Installs packages via Chocolatey.
- **macOS**: Installs packages via Homebrew.

## Author

David C. Manuelda  
[StormByte@gmail.com](mailto:StormByte@gmail.com)

## Branding

| Property | Value        |
|----------|--------------|
| Icon     | `hard-drive` |
| Color    | `green`      |

## Inputs

| Name        | Required | Default | Description |
|-------------|----------|---------|-------------|
| `packages`  | **Yes**  | —       | Space-separated list of packages to install.<br>• Linux → APT packages<br>• Windows → Chocolatey packages<br>• macOS → Homebrew formulae |
| `cache-key` | No       | `""`    | Prefix for the cache key (**Linux only**). If empty, caching is disabled.<br>Change this value to force a cache miss and perform a fresh download. |
| `unique`    | No       | `"true"`| (**Linux only**) If `true`, the provided `cache-key` is treated as globally unique (no hash suffix is added).<br>If `false`, a deterministic 16-character hash of the package list is appended to avoid collisions when the same prefix is reused with different package sets. |

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
```

### macOS
Simply runs:
```bash
brew install <packages>
```

## Usage Example

```yaml
- name: Install packages
  uses: stormbytepp/githubactions/.github/actions/install-cached@master
  with:
    packages: 'cmake ninja ccache'
    cache-key: 'build-tools-v1'   # only used on Linux
    unique: true
```

## Notes

- Caching is currently only implemented for Linux (APT `.deb` files).
- On Windows and macOS the action performs a direct install with no caching.
- Package names may differ between APT, Chocolatey and Homebrew. Use the appropriate names for each platform when targeting multiple OSes.

## License

This repository is licensed under the **MIT License**.  
See [`LICENSE.txt`](LICENSE.txt) at the repository root for the full text.
