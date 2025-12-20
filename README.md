# StormByte GitHub Actions

This folder contains three reusable GitHub Actions used by the StormByte repositories.

- `actions/install-cached` — composite action to cache and install APT packages (Linux) or Chocolatey packages (Windows).
- `actions/install-toolchain` — composite action to install and cache compiler toolchains (gcc/clang/msvc).
- `actions/generate-doc` — composite action to build project documentation and upload a GitHub Pages artifact.

**Quick notes**
- Each of these is a composite action (`runs.using: composite`) and therefore runs inside the caller job's runner and workspace.
- Workflow-level settings such as `permissions`, `concurrency`, `environment`, and `jobs` must be configured by the caller workflow (not by these actions).

**1) `actions/install-cached`**

Description: Cache and install system packages.

Inputs:
- `packages` (required) — space-separated list of packages to install and cache.
- `cache-key` (optional) — cache key (default: `apt-packages-cache`).

Usage (from a workflow job):

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install packages
        uses: ./actions/install-cached
        with:
          packages: "curl git"
          cache-key: "toolchain-apt-v1"
```

Usage (call from another action that is sibling to `install-cached`):

```yaml
- name: Install pre-reqs
  uses: ../install-cached
  with:
    packages: "cmake ninja"
```


**2) `actions/install-toolchain`**

Description: Install and cache compiler toolchains.

Inputs:
- `toolchain` (required) — supported values: `gcc`, `clang`, `clang-libc++`, `msvc`.

Usage (from a workflow job):

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install toolchain
        uses: ./actions/install-toolchain
        with:
          toolchain: clang
```

Notes: The action may call `../install-cached` internally (relative path) to install OS packages.


**3) `actions/generate-doc`**

Description: Build documentation (CMake/Jekyll) and upload a Pages artifact. This action is a composite action and therefore cannot set workflow-level permissions or environments — the caller workflow must set those (for example `pages: write`).

Inputs:
- `doc_target` (required) — CMake target to build documentation.
- `docs_source_dir` (optional, default `./docs`) — path to generated docs.
- `extra-cmake-options` (optional) — extra CMake configure options.
- `extra-install` (optional) — extra apt packages to install on the runner.

Usage example (caller workflow must provide Pages permissions and can set concurrency/environment):

```yaml
on:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate and upload docs
        uses: ./actions/generate-doc
        with:
          doc_target: docs
          docs_source_dir: ./docs
          extra-cmake-options: "-DENABLE_FEATURE=ON"
```

Notes: If you need the docs generation to run as a separate workflow with its own runner and environment, create a reusable workflow under `.github/workflows/` and call these composite actions from its jobs.

---

If you want, I can also add a top-level `.github/workflows/generate-doc.yml` reusable workflow that calls `./actions/generate-doc` and sets the `permissions` and `concurrency` for GitHub Pages deployments. Reply with `add workflow` if you want that created.
