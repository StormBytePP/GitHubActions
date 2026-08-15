# Reusable Workflows

This folder contains reusable GitHub Actions workflows intended to be called via `workflow_call` from other repositories or workflows.

## generate-and-deploy-docs

Reusable workflow that builds documentation using the `generate-doc` composite action and deploys the result to GitHub Pages.

### Inputs

| Name                  | Required | Default   | Description |
|-----------------------|----------|-----------|-------------|
| `doc_target`          | **Yes**  | —         | CMake target used to generate the documentation |
| `extra-cmake-options` | No       | `""`      | Additional CMake configuration options |
| `extra-install`       | No       | `""`      | Space-separated list of extra APT packages to install |
| `docs_source_dir`     | No       | `./docs`  | Directory containing the documentation source (Jekyll) |
| `docs_output_dir`     | No       | `./_site` | Directory uploaded as the GitHub Pages artifact |

### Behavior

1. **generate-docs** job  
   - Calls `generate-doc` (checkout with cached submodules, toolchain, CMake doc target, Jekyll → `./_site`)  
   - Uploads `docs_output_dir` with `actions/upload-pages-artifact@v3`

2. **deploy** job  
   - Depends on `generate-docs`  
   - Deploys with `actions/deploy-pages@v4`  
   - Uses the `github-pages` environment and exposes the page URL

Concurrency group `pages` is used so deploys do not overlap (`cancel-in-progress: false`).

### Usage Example

```yaml
name: Documentation Deployment

on:
  push:
    branches: ["master"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  docs:
    uses: stormbytepp/githubactions/.github/workflows/generate-and-deploy-docs.yml@master
    with:
      doc_target: my_docs_target
      docs_source_dir: ./docs
      docs_output_dir: ./_site
      extra-cmake-options: -DENABLE_DOC=ON
```

### Required Permissions

The **calling** workflow should declare:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

The reusable `generate-docs` job also sets `actions: write` so submodule caches from `checkout-cached` can be saved.

### External actions used

- `stormbytepp/githubactions/.github/actions/generate-doc`
- `actions/upload-pages-artifact@v3`
- `actions/deploy-pages@v4`

### License

This repository is licensed under the **MIT License**.  
See [`LICENSE.txt`](LICENSE.txt) at the repository root for the full text.
