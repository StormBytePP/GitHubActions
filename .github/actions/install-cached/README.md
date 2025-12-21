# Cache and Install APT Packages

Description
-----------
Composite action that installs and caches APT packages on Linux runners to speed up repeated installations. On Windows it installs packages via Chocolatey.

Author
------
David C. Manuelda <StormByte@gmail.com>

Branding
--------
Icon: hard-drive
Color: green

Inputs
------
- `packages` (required) — Space-separated list of packages to install. On Linux these are APT packages; on Windows these are Chocolatey packages.
- `cache-key` (optional) — Unique cache key. Change this to invalidate the cache and force a fresh install.

Behavior
--------
- Linux: uses `awalsh128/cache-apt-pkgs-action@v1` to install and cache APT packages.
- Windows: runs `choco install <packages> -y` using PowerShell.

Usage
-----
Reference the action by repository:

```yaml
uses: stormbytepp/githubactions/.github/actions/install-cached@master
with:
  packages: 'build-essential clang-20 cmake'
  cache-key: 'toolchain-clang-20'
```

Publishing Tips
---------------
- Include this README and clear examples for both Linux and Windows.
- Explain any package name differences between distributions or Chocolatey equivalents.

External actions used
---------------------
- `awalsh128/cache-apt-pkgs-action@v1` (Linux APT caching)

License
-------
This repository is licensed under the MIT License — see `LICENSE.txt` at the repository root.
