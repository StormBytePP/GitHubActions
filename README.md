# GitHub Actions and Reusable Workflows

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.txt)

This repository contains composite GitHub Actions and reusable workflows used by StormByte projects for CI tasks such as installing toolchains, caching packages, and generating documentation.

Included resources (links to their READMEs)
- Actions:
  - [.github/actions/install-toolchain/README.md](.github/actions/install-toolchain/README.md) — Installs and configures compiler toolchains (gcc/clang/MSVC).
  - [.github/actions/install-cached/README.md](.github/actions/install-cached/README.md) — Installs and caches system packages (APT/Chocolatey).
  - [.github/actions/generate-doc/README.md](.github/actions/generate-doc/README.md) — Builds project documentation and prepares a Pages artifact.
- Reusable workflows:
  - [.github/workflows/README.md](.github/workflows/README.md) — Reusable workflows (e.g., generate-and-deploy-docs) for calling the actions above.

See each linked README for full usage, inputs, and external dependencies.

License
-------
This repository is licensed under the MIT License — see `LICENSE.txt` at the repository root.
