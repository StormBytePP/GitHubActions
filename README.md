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

Examples
--------
Save updated ccache only on successful job:

```yaml
# Place this after your build steps so the cache contains the final compiled artifacts.
- name: Save updated ccache (only on success)
  if: ${{ success() && env.CCACHE_FULL_KEY != '' }}
  uses: actions/cache@v4
  with:
    path: ~/.ccache
    key: ${{ env.CCACHE_FULL_KEY }}
```

Notes:
- `success()` ensures the step runs only when the job completes successfully (avoids saving partial caches on failure).
- `env.CCACHE_FULL_KEY` is produced by the `install-toolchain` action when you pass `ccache-key` and the action computes the full key.

- **Permission required for overwrite:** The `install-toolchain` action can delete an existing cache entry via the GitHub API before saving to force an overwrite. To allow this the workflow that calls the action must grant the `GITHUB_TOKEN` write access to actions caches. Add the following at the top of your workflow file:

```yaml
permissions:
  actions: write
```

- **Notes on safety:** Deleting and re-creating caches requires `actions: write` and can race if multiple runs share the same key. If you prefer a safer approach, include a content hash or a run-unique suffix in the cache key so saves always create a new entry.

