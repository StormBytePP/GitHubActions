# Cache and Install Packages

Install packages with the platform's package manager:

- Linux: APT, optional APT-index and `.deb` caches.
- Windows: Chocolatey.
- macOS: Homebrew.

## Inputs

| Input | Default | Description |
|---|---:|---|
| `packages` | — | Required, space-separated package names. |
| `cache-key` | `""` | Linux `.deb` cache namespace; empty disables `.deb` caching. |
| `lists-cache-key` | `apt-lists` | APT lists cache namespace; empty bypasses the shared index cache. |
| `libc` | `glibc` | Linux cache partition. APT package caching is intended for glibc runners. |
| `rotate-weekly` | `true` | Add the UTC ISO week to this action's APT-index key. |
| `unique` | `true` | Keep one `.deb` cache for the namespace, or hash the normalized package list when false. |

APT cache keys include OS, distribution version, runner architecture, and libc
to prevent incompatible package indexes or archives from being reused across
runner variants. The APT index restore uses the same cache path and accepts the matching prefix written by
[update-apt-cached](../update-apt-cached/README.md).

## Usage

```yaml
- uses: stormbytepp/githubactions/.github/actions/install-cached@master
  with:
    packages: cmake ninja-build
    lists-cache-key: apt-lists
    cache-key: build-tools
    libc: glibc
```

On Linux, this action restores cached package indexes and `.deb` files, installs
the requested packages, and saves newly downloaded archives. On Windows it
installs through Chocolatey and adds known NASM/YASM directories to `PATH`. On
macOS it installs through Homebrew.

## License

MIT. See [`LICENSE.txt`](../../../LICENSE.txt) at the repository root.
