# Build with Toolchain

Composite action for configuring and building a CMake project with Ninja. It can
run tests, install to a prefix, cache compiler and BuildMaster downloads, and
upload an installed package to an existing GitHub tag release.

## Inputs

| Input | Default | Description |
|---|---:|---|
| `compiler` | — | Required: `gcc`, `clang`, `msvc`, or `clang-cl` (Windows only). |
| `compiler-version` | platform default | Requested GCC/Clang major version. Alpine 3.24 uses GCC 15 or Clang 22. |
| `cxx-stdlib` | platform default | C++ runtime: `libstdc++` or `libc++`. Independent of compiler selection; Clang with `libstdc++` is supported. |
| `libc` | `glibc` | Linux runtime: `glibc` or `musl`. musl uses an Alpine 3.24 container on the native Linux runner architecture. |
| `compiler-cache-key` | `""` | Cache namespace; empty disables ccache/sccache. |
| `compiler-cache-scope` | `""` | Additional per-matrix/per-job cache namespace. |
| `buildmaster-cache-key` | `""` | BuildMaster downloads-cache namespace; empty disables it. |
| `source-dir` | `.` | CMake source directory. |
| `build-dir` | `build` | CMake build directory. |
| `build-type` | `Debug` | CMake build type. |
| `cmake-options` | `""` | Extra CMake configure arguments. |
| `build-target` | `""` | Optional Ninja target; empty builds all targets. |
| `ctest` | `false` | Run CTest after the build. |
| `ctest-options` | `""` | Extra CTest arguments. |
| `install` | `false` | Run `cmake --install` after build/tests. |
| `install-prefix` | `""` | Sets `CMAKE_INSTALL_PREFIX`; does not itself run installation. |
| `deploy` | `false` | Installs and uploads a ZIP to the existing GitHub release for the current tag. Requires `install-prefix` and `contents: write`. |
| `docs` | `false` | Install Doxygen and Graphviz where supported. |
| `meson` | `true` | Install Meson. |
| `extra-packages` | `""` | Additional packages in the build environment, using native package names. |
| `container-env` | `""` | Additional host environment variable **names** to pass into Alpine, separated by whitespace. |
| `pgo` | unchanged | `true`/`false` sets `ENABLE_PGO=ON/OFF`. Empty leaves the CMake option unchanged. |
| `lto` | unchanged | `true`/`false` sets `ENABLE_LTO=ON/OFF`. Empty leaves the CMake option unchanged. |
| `cpu-baseline` | `auto` | Target CPU flags for C and C++. `auto` selects the StormByte baseline below; `none` adds nothing; any other value is used verbatim and must contain `-march=`, `-mcpu=`, or `/arch:`. |

The action exposes the selected C and C++ compilers as `CC` and `CXX` during
configuration, PGO training and explicit CTest runs, including inside Alpine.
Tests that launch nested CMake configurations therefore use the same toolchain
as the main build.

`pgo` or `lto` fails early if `cmake-options` sets the same option to the
opposite value. These inputs are intended for projects that define
`ENABLE_PGO` and `ENABLE_LTO`. `cmake-options` and `ctest-options` accept
shell-style quoting; unbalanced quotes fail rather than being ignored.
On Windows, backslashes are always literal so native paths remain intact; use
single or double quotes to group arguments rather than backslash escapes.

The action still accepts the old input names (`toolchain`, `version`,
`ccache-key`, `cache-scope`, `buildmaster-datadir-cache-key`,
`configure-options`, `target`, `run-tests`, `install-location`, and
`install-meson`) as compatibility aliases. Prefer the canonical names above.

## CPU baseline

| Platform | `cpu-baseline: auto` |
|---|---|
| Linux x64 (glibc and musl) | `-march=x86-64-v3` (AVX2, FMA, BMI1/2) |
| Linux ARM64 (glibc and musl) | `-march=armv8.2-a` |
| macOS ARM64 | `-mcpu=apple-m1` |
| Windows x64 (MSVC and clang-cl) | `/arch:AVX` |

`auto` fails on other platforms, such as macOS x64; set an explicit value or
`none` there. Windows ARM64 is not supported.

The flags are appended to the `CFLAGS` and `CXXFLAGS` environment used by the
CMake configure step, and to any `CMAKE_C_FLAGS`/`CMAKE_CXX_FLAGS` given in
`cmake-options`. CMake therefore keeps its compiler defaults (for example the
MSVC `/DWIN32 /EHsc` flags), and the result lands in the `CMAKE_C_FLAGS` and
`CMAKE_CXX_FLAGS` cache entries. BuildMaster passes those entries to every
CMake and Meson dependency it builds, and StormByte's `pgo.cmake` copies them
to the instrumented build, so the whole binary uses one baseline.

If `CFLAGS`, `CXXFLAGS`, or any `CMAKE_C_FLAGS*`/`CMAKE_CXX_FLAGS*` value in
`cmake-options` already contains `-march=`, `-mcpu=`, `/arch:`, or `-arch:`,
the caller's choice wins: the baseline is not applied and the action emits a
warning. `-mtune=` alone does not select a target CPU and does not disable the
baseline. For musl builds only the variables forwarded into Alpine are checked.

The action does not set an optimization level. Release builds use CMake's
default (`-O3` for GCC/Clang, `/O2` for MSVC/clang-cl) unless the project or
the caller overrides `CMAKE_<LANG>_FLAGS_RELEASE`. BuildMaster dependencies
keep their own build-type defaults.

## Toolchain and runtime behavior

- Compiler selection and C++ standard-library selection are independent.
  `compiler: clang` with `cxx-stdlib: libstdc++` does not switch to GCC.
- For Clang, the action passes `-stdlib=` through C++ configuration and
  `CMAKE_CXX_STANDARD_LIBRARIES`, including for BuildMaster-managed builds.
- Linux/glibc toolchains use the runner's Ubuntu environment. For the StormByte
  glibc baseline, callers should explicitly use `ubuntu-26.04` or
  `ubuntu-26.04-arm`; do not use `ubuntu-latest`. Ubuntu 26.04 provides glibc
  2.43, the conservative minimum for this build baseline.
- Linux/musl builds run in `alpine:3.24` on a native Linux x64/ARM64 runner.
  Alpine 3.24 provides musl 1.2.6. The action does not cross-compile.
- Windows Debug and RelWithDebInfo keep the existing `/Z7` behavior for
  sccache compatibility. `msvc-embedded-debug` remains a deprecated no-op.
  Windows ARM64 is not supported.

Installing a project does not automatically bundle the selected C++ standard
library, the C runtime, or other system dependencies. Target systems must
provide compatible runtimes in addition to the stated C-library baseline.

### Packages and Alpine isolation

The Ubuntu toolchain includes the common source-build tools, including Perl,
OpenSSL, NASM, YASM, Flex, Bison, pkg-config, Autotools, and the Clang profile
runtime. Alpine installs their native equivalents, an actual Ninja binary,
and, for Clang, compiler-rt, `clang-scan-deps` for C++ modules and the
matching LLVM tools. Meson and Doxygen
remain controlled by `meson` and `docs`.

Use `extra-packages` for project-specific dependencies: they are installed
with APT, apk, Homebrew, or Chocolatey for the selected build environment.
Package names can differ between distributions. In particular, packages
installed on the Ubuntu host before a musl build are **not** available inside
Alpine. For example, an Alpine `SYSTEM` database build can use
`sqlite-dev postgresql16-dev mariadb-connector-c-dev freetds-dev`; Ubuntu uses
different development-package names.

Alpine mounts the workspace, runner temp directory, and this action. Source,
build, and BuildMaster data paths must be within the workspace or runner temp
directory. When installation is enabled, its destination must also be within
one of those directories; otherwise installation fails instead of writing to a
disposable container. A configuration-only `install-prefix` can point
elsewhere. Compilation and installation run as the runner's UID/GID, not root.

The container uses the Linux host network so tests and PGO training can reach
services exposed on `localhost`. `CI`, `GITHUB_ACTIONS`, `LD_LIBRARY_PATH`,
and the existing `POSTGRES_*`, `MARIADB_*`, and `MSSQL_*` test variables are
forwarded when set. Use `container-env` for other variables; specify their
names, not their values. Requested names must exist, and action-owned
variables cannot be overridden. Other host variables and credentials are not
forwarded automatically.

The [official SQL Server container images](https://learn.microsoft.com/en-us/sql/linux/containers/deploy?view=sql-server-ver17)
are supported only on x86-64 Linux hosts. Database tests on an ARM64 runner
therefore need a reachable x86-64 SQL Server; installing packages in Alpine
does not provide one.

## Caching

Compiler cache keys include OS, runner architecture, libc, compiler and version,
C++ standard library, build type, PGO/LTO settings, job, namespace, and optional
scope. The effective `cpu-baseline` flags are part of the key's SHA-256
identity. BuildMaster keys use the same platform/build-variant dimensions and also
include job, namespace, and optional scope. Each action run saves its own
snapshot; old snapshots are removed only for that exact key and ref, and only
after the replacement is visible in the Actions cache API. Snapshot delimiters
also prevent a restore from matching a longer, differently scoped key. A
SHA-256 of the unsanitized identity keeps distinct namespaces and scopes from
colliding when punctuation is normalized in the readable part of a key.

BuildMaster caches only `<BUILDMASTER_DATADIR>/downloads`. Its `tmp/` directory
is removed before restore and again after restore, so temporary work is never
reused or saved.

The calling workflow needs `actions: write` for old-cache cleanup. Deploying
also requires `contents: write`:

```yaml
permissions:
  actions: write
  contents: write
```

### CI example

```yaml
- uses: stormbytepp/githubactions/.github/actions/build-with-toolchain@master
  with:
    compiler: clang
    cxx-stdlib: libc++
    libc: glibc
    compiler-cache-key: v1
    build-type: Release
    pgo: false
    lto: false
    cpu-baseline: auto
    cmake-options: -DENABLE_TEST=ON
    ctest: true
```

### Alpine/musl example

```yaml
- uses: stormbytepp/githubactions/.github/actions/build-with-toolchain@master
  with:
    compiler: gcc
    libc: musl
    extra-packages: sqlite-dev
    compiler-cache-key: v1
    build-type: Release
    ctest: true
```

### Deploy an installed package

The tag release must already exist. The action does not create releases.

```yaml
- uses: stormbytepp/githubactions/.github/actions/build-with-toolchain@master
  with:
    compiler: clang
    libc: glibc
    build-type: Release
    install-prefix: package
    deploy: true
```

Asset names preserve the repository and tag:

- Linux: `<repository>-<tag>-linux-<amd64|arm64>-<glibc|musl>-<libstdc++|libc++>.zip`
- macOS: `<repository>-<tag>-macos-<x64|arm64>.zip`
- Windows: `<repository>-<tag>-windows-x64.zip`

Compiler names and versions are deliberately not part of the asset name.
Do not deploy two builds with the same OS, architecture, libc, and standard
library to the same tag: the later upload replaces the first. Existing
`LICENSE*`, `COPYING*`, and `THIRD-PARTY*` files from the workspace are
included in the ZIP. A prefix containing the workspace root is rejected.

## Outputs

| Output | Description |
|---|---|
| `c_compiler` | Selected C compiler. For musl, the name is the compiler inside Alpine (`gcc` or `clang-22`). |
| `cxx_compiler` | Selected C++ compiler. For musl, the name is the compiler inside Alpine (`g++` or `clang++-22`). |

## External actions

- `stormbytepp/githubactions/.github/actions/install-toolchain`
- `actions/cache/restore@v6` and `actions/cache/save@v6`
- `actions/github-script@v9` for safe cache snapshot cleanup

## Tests

From the repository root, run the focused tests with:

```sh
node --test .github/actions/build-with-toolchain/*.test.cjs
```

Docker integration tests are opt-in. The Alpine test builds all supported
compiler/standard-library combinations on the native x64 or ARM64 host. The
Ubuntu test exercises the host toolchain, build, and documentation steps:

```sh
RUN_UBUNTU_INTEGRATION=1 node --test .github/actions/build-with-toolchain/ubuntu.integration.test.cjs
RUN_ALPINE_INTEGRATION=1 node --test .github/actions/build-with-toolchain/alpine.integration.test.cjs
RUN_POWERSHELL_INTEGRATION=1 node --test .github/actions/build-with-toolchain/powershell.integration.test.cjs
```

Set `STORMBYTE_PGO_CMAKE` to a StormByte project's `cmake/pgo.cmake` to test
its actual PGO training pipeline in the Linux tests. Without it, the fixtures
check Clang profile instrumentation. The PowerShell container checks script and
argument behavior; it does not replace tests on a real Windows runner.

## License

MIT. See [`LICENSE.txt`](../../../LICENSE.txt) at the repository root.
