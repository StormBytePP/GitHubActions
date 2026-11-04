# Install Compiler Toolchain

Install compiler and build tools without configuring or building a project.
For caching, CMake configuration, tests, installation, and release deployment,
use [Build with Toolchain](../build-with-toolchain/README.md).

## Supported toolchains

- Linux: `gcc`, `clang`, `clang-libc++`
- macOS: Homebrew GCC or Apple Clang
- Windows x64: `msvc`, `clang-cl` (Windows ARM64 is not supported)

## Inputs

| Input | Default | Description |
|---|---:|---|
| `toolchain` | — | Required compiler/toolchain name. |
| `version` | platform default | GCC/Clang major version; Ubuntu defaults to GCC 16 and Clang 22. |
| `docs` | `false` | Install Doxygen and Graphviz on Linux/macOS. |
| `ccache-key` | `""` | Install ccache on Linux/macOS or sccache on Windows when non-empty. Cache restore/save is managed by the caller. |
| `install-meson` | `true` | Install Meson using pip. |
| `install-ninja` | `true` | Install Ninja using pip. |

APT cache namespaces include the toolchain, version, runner architecture, and
glibc scope, Ubuntu version, and normalized package list. The Ubuntu toolchain
also installs common source-build tools: Perl, OpenSSL, NASM, YASM, Flex,
Bison, pkg-config, Autotools, Git, curl, and archive tools. Clang includes the
matching compiler-rt package for PGO. musl builds do not use this action; the
main build action installs its toolchain and equivalent tools inside Alpine.
On Ubuntu, `clang` also installs GCC 16 and its libstdc++ development headers;
`clang-libc++` uses LLVM's libc++ instead.
The default GCC 16 and Clang 22 packages require an Ubuntu release that
provides them; use `ubuntu-26.04` for the StormByte baseline.

## Outputs

| Output | Description |
|---|---|
| `c_compiler` | Selected C compiler executable. |
| `cxx_compiler` | Selected C++ compiler executable. |
| `sccache_bin` | Full path to the downloaded Windows sccache binary, when enabled. |

## Usage

```yaml
- uses: stormbytepp/githubactions/.github/actions/install-toolchain@master
  id: toolchain
  with:
    toolchain: clang-libc++
    version: "22"
```

Use the compiler outputs to configure a project. On macOS, the Homebrew GCC
selection also sets `CC` and `CXX`.

## License

MIT. See [`LICENSE.txt`](../../../LICENSE.txt) at the repository root.
