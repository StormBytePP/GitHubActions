# StormByte GitHub Actions

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.txt)

Composite actions and reusable workflows for StormByte repositories.

## Actions

- [Build with Toolchain](.github/actions/build-with-toolchain/README.md) — CMake/Ninja build, compiler and BuildMaster caches, tests, installation, and release deployment.
- [Install Compiler Toolchain](.github/actions/install-toolchain/README.md) — Install GCC, Clang, MSVC, or clang-cl and build tools.
- [Cache and Install Packages](.github/actions/install-cached/README.md) — Install system packages with architecture- and libc-scoped APT caches.
- [Update APT lists](.github/actions/update-apt-cached/README.md) — Refresh and cache Linux package indexes.
- [Generate Documentation](.github/actions/generate-doc/README.md) — Build project documentation and prepare a Jekyll site for Pages.
- [Checkout Cached](.github/actions/checkout-cached/README.md) — Checkout repositories with cached submodules.

## Reusable workflows

- [Workflow documentation](.github/workflows/README.md)
- [Generate and deploy documentation](.github/workflows/generate-and-deploy-docs.yml)

## Linux build baseline

The build action supports `glibc` on Ubuntu runners and `musl` in an Alpine
3.24 container on native Linux x64/ARM64 runners. For StormByte's glibc
baseline, callers should select `ubuntu-26.04` or `ubuntu-26.04-arm`
explicitly rather than `ubuntu-latest`.

Ubuntu 26.04 provides glibc 2.43 and Alpine 3.24 provides musl 1.2.6. Treat
those versions as conservative C-library baselines for their respective
artifacts; other dynamic dependencies, including the selected C++ standard
library, must also be available on the target system. The actions do not
automatically bundle those system runtimes.

The build action's `cpu-baseline: auto` targets `x86-64-v3` on Linux x64,
`armv8.2-a` on Linux ARM64, Apple M1 on macOS ARM64, and AVX on Windows x64.
It applies to the project and to every BuildMaster-managed dependency; the
action does not change the optimization level.

The build action installs common source-build tools and accepts
platform-specific extra packages. Alpine builds run as the runner user with
host networking for local test services; their packages and environment are
separate from the Ubuntu host.

The action manages compiler-cache and BuildMaster download snapshots per build
variant. Calling workflows need `actions: write` for old snapshot cleanup.
Release deployment additionally requires `contents: write` and an existing
tag release.

See the action-specific READMEs for input contracts, examples, cache behavior,
and permissions.

## License

MIT. See [LICENSE.txt](LICENSE.txt).
