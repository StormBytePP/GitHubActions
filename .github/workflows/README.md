# Reusable Workflows

This folder contains reusable GitHub Actions workflows intended to be called via `workflow_call` from other repositories or workflows.

## generate-and-deploy-docs

Reusable workflow that builds documentation using the `generate-doc` composite action and deploys the result to GitHub Pages.

### Inputs

| Name                  | Required | Default       | Description |
|-----------------------|----------|---------------|-------------|
| `doc_target`          | **Yes**  | —             | CMake target used to generate the documentation |
| `extra-cmake-options` | No       | `""`          | Additional CMake configuration options |
| `extra-install`       | No       | `""`          | Space-separated list of extra APT packages to install |
| `docs_source_dir`     | No       | `./docs`      | Directory containing the documentation source |
| `docs_output_dir`     | No       | `./docs/html` | Directory that contains the generated HTML (used as artifact path) |

### Behavior

1. **generate-docs** job
   - Checks out the repository
   - Calls the `generate-doc` composite action to build the documentation
   - Uploads the generated HTML as a GitHub Pages artifact (`actions/upload-pages-artifact`)

2. **deploy** job
   - Depends on `generate-docs`
   - Deploys the artifact to GitHub Pages using `actions/deploy-pages@v4`
   - Sets the `github-pages` environment and exposes the deployed page URL

### Usage Example

```yaml
jobs:
  docs:
    uses: stormbytepp/githubactions/.github/workflows/generate-and-deploy-docs.yml@master
    with:
      doc_target: my_docs_target
      docs_source_dir: ./docs
      docs_output_dir: ./docs/html          # adjust if needed
      extra-cmake-options: -DENABLE_DOCS=ON
```

### Required Permissions

The **calling** workflow must declare these permissions:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

### External Actions Used

- `actions/checkout@v4`
- `actions/upload-pages-artifact@v3`
- `actions/deploy-pages@v4`
- `stormbytepp/githubactions/.github/actions/generate-doc` (composite action)

### License

This repository is licensed under the **MIT License**.  
See [`LICENSE.txt`](LICENSE.txt) at the repository root for the full text.
