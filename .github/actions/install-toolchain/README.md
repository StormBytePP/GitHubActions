# Cache and Setup Compiler Toolchain

Composite GitHub Action that installs, configures and (optionally) caches compiler toolchains on GitHub-hosted runners.

**Supported toolchains**
- **Linux**: `gcc`, `clang`, `clang-libc++`
- **Windows**: `msvc`

The action also:
- Registers the selected compilers with `update-alternatives` on Linux
- Optionally installs and configures **ccache** (Linux) / **BuildCache** (Windows)
- Optionally installs documentation tools (Doxygen + Graphviz)
- Optionally installs Meson
- Exports the chosen compilers as both **outputs** and environment variables (`CC` / `CXX`)

## Author

David C. Manuelda  
[StormByte@gmail.com](mailto:StormByte@gmail.com)

## Branding

| Property | Value     |
|----------|-----------|
| Icon     | `settings` |
| Color    | `green`   |

## Inputs

| Name            | Required | Default | Description |
|-----------------|----------|---------|-------------|
| `toolchain`     | **Yes**  | —       | Toolchain to install.<br>Allowed values: `gcc`, `clang`, `clang-libc++` (Linux) or `msvc` (Windows). |
| `version`       | No       | `""`    | Major version for `gcc` or `clang`.<br>Defaults: **14** (gcc) / **20** (clang). |
| `docs`          | No       | `false` | Install documentation tools (`doxygen` + `graphviz`) on Linux. |
| `ccache-key`    | No       | `""`    | Base cache key for **ccache** (Linux) or **BuildCache** (Windows).<br>Leave empty to disable compiler caching. |
| `install-meson` | No       | `true`  | Install Meson 1.10.2 via `pip`. |

## Outputs

| Name                 | Description |
|----------------------|-------------|
| `c_compiler`         | Selected C compiler (`gcc`, `clang` or `cl`) |
| `cxx_compiler`       | Selected C++ compiler (`g++`, `clang++` or `cl`) |
| `buildcache_bin`     | Full path to `buildcache.exe` (Windows only, when `ccache-key` is set) |
| `buildcache_wrapper` | Directory containing the `cl.bat` wrapper (Windows only) |
| `buildcache_dir`     | BuildCache cache directory (Windows only) |

## Behavior

### Linux
1. Resolves the requested compiler version (or uses defaults).
2. Installs in a **single cached step**:
   - `ninja-build`, `build-essential`, `cmake`
   - The selected toolchain (`gcc-X` / `clang-X` + optional `libc++`)
   - `ccache` (if `ccache-key` is provided)
   - Documentation tools (if `docs: true`)
3. Registers the compilers with `update-alternatives`.
4. Configures ccache (size limit 2 GB) and restores/saves the cache.
5. Optionally installs Meson.

### Windows
1. Validates that `toolchain` is `msvc`.
2. Sets up the MSVC environment with `ilammy/msvc-dev-cmd`.
3. Downloads and configures **BuildCache** (if `ccache-key` is provided).
4. Creates a `cl.bat` wrapper so CMake and other tools transparently use BuildCache.
5. Restores/saves the BuildCache directory.

### Common
- Exports `CC` and `CXX` to the job environment.
- Sets the corresponding action outputs.

## Usage examples

### Basic GCC

```yaml
- name: Setup GCC toolchain
  uses: stormbytepp/githubactions/.github/actions/install-toolchain@master
  with:
    toolchain: gcc
```

### Clang + libc++ with specific version + ccache

```yaml
- name: Setup Clang with libc++
  id: toolchain
  uses: stormbytepp/githubactions/.github/actions/install-toolchain@master
  with:
    toolchain: clang-libc++
    version: '19'
    ccache-key: my-project-clang19
    docs: true
```

### Windows MSVC + BuildCache

```yaml
- name: Setup MSVC
  uses: stormbytepp/githubactions/.github/actions/install-toolchain@master
  with:
    toolchain: msvc
    ccache-key: my-project-msvc
```

### Using the outputs

```yaml
- name: Configure CMake
  run: |
    cmake -B build \
      -DCMAKE_C_COMPILER=${{ steps.toolchain.outputs.c_compiler }} \
      -DCMAKE_CXX_COMPILER=${{ steps.toolchain.outputs.cxx_compiler }}
```

## Notes

- The APT packages are installed through the companion action `install-cached`, which provides deterministic caching of `.deb` files.
- Compiler cache keys are automatically namespaced with the toolchain and version.
- A new cache entry is created on every successful run (using `github.run_id`) so the cache is always updated without needing to delete previous entries.
- Meson installation can be disabled with `install-meson: false` if you don’t need it.

## External actions used

- `stormbytepp/githubactions/.github/actions/install-cached` (APT package caching)
- `actions/setup-python@v5`
- `actions/cache/restore@v4` & `actions/cache/save@v4`
- `ilammy/msvc-dev-cmd@v1`

## License

This repository is licensed under the **MIT License**.  
See [`LICENSE.txt`](LICENSE.txt) at the repository root for the full text.