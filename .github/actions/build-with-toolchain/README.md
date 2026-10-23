# Build with Toolchain

High-level composite action that:

1. Installs the requested compiler toolchain
2. Builds the project with **CMake + Ninja** (no third-party build action)
3. Saves the compiler cache **after** the real compilation

This is the recommended way to build projects when you want transparent compiler caching without managing cache save/restore in every workflow.

## Author

David C. Manuelda  
[StormByte@gmail.com](mailto:StormByte@gmail.com)

## Branding

| Property | Value     |
|----------|-----------|
| Icon     | `package` |
| Color    | `blue`    |

## Inputs

| Name                 | Required | Default     | Description |
|----------------------|----------|-------------|-------------|
| `toolchain`          | **Yes**  | —           | Toolchain to use: `gcc`, `clang`, `clang-libc++` (Linux/macOS) or `msvc`, `clang-cl` (Windows). |
| `ccache-key`         | No       | `""`        | Base cache key for ccache / sccache. Leave empty to disable compiler caching. |
| `cache-scope`        | No       | `""`        | Extra namespace per matrix cell or parallel job. Set this when cells otherwise share the OS, toolchain, job ID and `ccache-key`. |
| `buildmaster-datadir-cache-key` | No | `""` | Cache key for BuildMaster's data directory. Empty skips it. Non-empty restores that folder and passes it as `-DBUILDMASTER_DATADIR`. |
| `build-dir`          | No       | `"build"`   | CMake build directory. |
| `build-type`         | No       | `"Debug"`   | CMake build type (`Debug`, `Release`, …). |
| `configure-options`  | No       | `""`        | Extra options passed to CMake configure. |
| `target`             | No       | `""`        | Optional CMake target to build. Empty = build all. |
| `run-tests`          | No       | `"false"`   | Whether to run `ctest` after the build. |
| `install`            | No       | `"false"`   | Whether to run `cmake --install` after the build and tests. |
| `install-location`   | No       | `""`        | Prefix for that install (`--prefix`). Empty keeps the configured prefix. |
| `ctest-options`      | No       | `"--output-on-failure"` | Extra options for `ctest`. |
| `version`            | No       | `""`        | Optional major version for gcc/clang. |
| `docs`               | No       | `"false"`   | Install documentation tools (doxygen + graphviz). |
| `install-meson`      | No       | `"true"`    | Install Meson 1.10.2. |

## Outputs

| Name           | Description |
|----------------|-------------|
| `c_compiler`   | Selected C compiler |
| `cxx_compiler` | Selected C++ compiler |

## How caching works

| Platform | Tool | Notes |
|----------|------|--------|
| **Linux / macOS** | **ccache** | Wrappers on `PATH` |
| **Windows** | **sccache** | Via `CMAKE_*_COMPILER_LAUNCHER=sccache` |
| **Any** | **BuildMaster datadir** | Only when `buildmaster-datadir-cache-key` is set. The folder is `${{ runner.temp }}/buildmaster-datadir` and CMake receives `-DBUILDMASTER_DATADIR`. The string is the cache key; include the OS if two jobs must not share downloads. |

The action:

1. Restores the compiler cache (if any)
2. Configures and builds with CMake + Ninja
3. Prints cache statistics (hits / misses)
4. Saves the updated cache after a build attempt, including useful objects from a failed build or when later tests fail. Cancelled jobs and Windows builds whose cache could not be flushed do not save it.
5. Removes older snapshots **only on the current Git ref**, with the same cache version, and only after confirming the replacement exists in the cache API. Caches from other branches, PRs or tags, newer concurrent uploads, and other matrix scopes are preserved.

Cache keys include the OS, toolchain, `ccache-key`, job ID and optional `cache-scope`.
Each snapshot adds the run ID and attempt. Restore first looks for the current
snapshot, then earlier attempts of the run, then the latest matching snapshot
visible to the current ref. GitHub's branch/tag cache visibility rules still apply:
a release tag must not delete the default branch's snapshot just because it restored it.

On Windows, Debug and RelWithDebInfo builds use
`CMAKE_MSVC_DEBUG_INFORMATION_FORMAT=Embedded` (`/Z7`) and default CMP0141 to NEW.
This avoids the shared compiler PDB problem with sccache. Project policies,
target-specific flags and `configure-options` can override these defaults; check
the actual compile commands if sccache reports non-cacheable calls.

The Windows server starts inside each compilation step (configure and build).
It is stopped in that same step to finish cache writes before the step exits.
Only the build prints sccache statistics, including when Ninja fails, before the
server stops. Restore, configure, tests and install do not print empty or duplicate
sccache statistics; tests do not start a server. The executable is installed under
`${{ runner.temp }}/sccache-bin`, separately from the default cache directory
`${{ runner.temp }}/sccache`. Old snapshots may still contain the previously bundled
executable; changing `ccache-key` once creates a fresh namespace if desired.

### Interpreting Windows performance

- A restored archive is not a compiler cache hit. Check **Cache hits**, **Cache
  misses**, **Non-cacheable calls**, read/write errors and their reasons in the
  build statistics.
- sccache 0.10.0's direct/preprocessor cache is implemented for GCC and Clang,
  not the MSVC-style driver path used by `cl` and `clang-cl`. Even if the global
  statistics say direct mode is enabled, Windows cache hits still incur
  preprocessing and hashing overhead.
- Linking (including LTO), configure, tool installation, downloads and tests are
  not cached by the compiler cache. Compare the Ninja build time, not just the
  entire composite action's duration.
- A persistent VM may also reuse Ninja outputs and already-built dependencies.
  Hosted runners start with a fresh build tree. Compiler/SDK updates, changed
  flags, source paths or generated headers can also cause legitimate misses.
- Dependencies built outside CMake's compiler launchers do not automatically
  benefit from sccache. Check those build commands separately.

## Usage examples

### Basic Linux matrix

```yaml
- name: Build with toolchain
  uses: stormbytepp/githubactions/.github/actions/build-with-toolchain@master
  with:
    toolchain: ${{ matrix.compiler }}
    ccache-key: ${{ matrix.compiler }}-v1
    build-type: Debug
    configure-options: -DENABLE_TEST=ON
    run-tests: true
```

### Windows MSVC

```yaml
- name: Build with toolchain
  uses: stormbytepp/githubactions/.github/actions/build-with-toolchain@master
  with:
    toolchain: msvc
    ccache-key: msvc-v1
    build-type: Release
    configure-options: -DENABLE_TEST=ON
    run-tests: true
```

### Install into a prefix

```yaml
- name: Build with toolchain
  uses: stormbytepp/githubactions/.github/actions/build-with-toolchain@master
  with:
    toolchain: clang
    build-type: Release
    install: true
    install-location: ${{ runner.temp }}/stormbyte
```

### Clang + libc++ with ASAN

```yaml
- name: Build with toolchain
  uses: stormbytepp/githubactions/.github/actions/build-with-toolchain@master
  with:
    toolchain: clang-libc++
    ccache-key: clang-libc++-v1
    configure-options: >-
      -DENABLE_ASAN=ON
      -DENABLE_TEST=ON
      -DCMAKE_CXX_FLAGS=-stdlib=libc++
    run-tests: true
```

## Full workflow example

```yaml
name: Compile & Test

permissions:
  actions: write
  contents: read

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  build-linux:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        compiler: [gcc, clang, clang-libc++]
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true

      - uses: stormbytepp/githubactions/.github/actions/build-with-toolchain@master
        with:
          toolchain: ${{ matrix.compiler }}
          ccache-key: ${{ matrix.compiler }}-v1
          configure-options: -DENABLE_TEST=ON
          run-tests: true

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true

      - uses: stormbytepp/githubactions/.github/actions/build-with-toolchain@master
        with:
          toolchain: msvc
          ccache-key: msvc-v1
          configure-options: -DENABLE_TEST=ON
          run-tests: false

      # If tests need DLLs from the build tree:
      - name: Add DLL directory to PATH
        shell: pwsh
        run: |
          echo "${{ github.workspace }}\build\lib" | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append

      - name: Run unit tests
        shell: pwsh
        run: |
          ctest --output-on-failure --test-dir "${{ github.workspace }}\build\test"
```

## Notes

- Depends on `install-toolchain` for installation; compiler cache restore/save is managed here.
- The **save** of the compiler cache happens in this action, after the build.
- Calling workflows need `permissions: actions: write` for old-cache cleanup. Cache restore/save itself does not require that permission; read-only PR jobs may skip cleanup with a warning.
- APT package caching is handled by the underlying `install-cached` action.
- No dependency on `ashutoshvarma/action-cmake-build`; configure/build/test are done with plain `cmake` / `ctest`.

## External actions used

- `stormbytepp/githubactions/.github/actions/install-toolchain`
- `actions/cache/restore@v6` and `actions/cache/save@v6`
- `actions/github-script@v9`

## License

This repository is licensed under the **MIT License**.  
See [`LICENSE.txt`](LICENSE.txt) at the repository root for the full text.
