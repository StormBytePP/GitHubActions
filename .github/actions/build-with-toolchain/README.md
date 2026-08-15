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
| `toolchain`          | **Yes**  | —           | Toolchain to use: `gcc`, `clang`, `clang-libc++` (Linux/macOS) or `msvc` (Windows). |
| `ccache-key`         | No       | `""`        | Base cache key for ccache / sccache. Leave empty to disable compiler caching. |
| `build-dir`          | No       | `"build"`   | CMake build directory. |
| `build-type`         | No       | `"Debug"`   | CMake build type (`Debug`, `Release`, …). |
| `configure-options`  | No       | `""`        | Extra options passed to CMake configure. |
| `target`             | No       | `""`        | Optional CMake target to build. Empty = build all. |
| `run-tests`          | No       | `"false"`   | Whether to run `ctest` after the build. |
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

The action:

1. Restores the compiler cache (if any)
2. Configures and builds with CMake + Ninja
3. Prints cache statistics (hits / misses)
4. Saves the updated cache **only after a successful build**

On Windows, Debug builds use `CMAKE_MSVC_DEBUG_INFORMATION_FORMAT=Embedded` (`/Z7`) to avoid PDB race conditions when compiling in parallel through sccache.

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

- Depends on `install-toolchain` (install + **restore** only).
- The **save** of the compiler cache happens in this action, after the build.
- Calling workflows need `permissions: actions: write` so caches can be saved.
- APT package caching is handled by the underlying `install-cached` action.
- No dependency on `ashutoshvarma/action-cmake-build`; configure/build/test are done with plain `cmake` / `ctest`.

## External actions used

- `stormbytepp/githubactions/.github/actions/install-toolchain`
- `actions/cache/save@v4`

## License

This repository is licensed under the **MIT License**.  
See [`LICENSE.txt`](LICENSE.txt) at the repository root for the full text.
