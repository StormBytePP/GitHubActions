# Reusable Workflows

This folder contains reusable GitHub Actions workflows intended to be called via `workflow_call` from other repositories or workflows.

generate-and-deploy-docs
------------------------
Description: Reusable workflow that builds documentation using the `generate-doc` composite action and deploys the result to GitHub Pages.

Inputs
------
- `doc_target` (required) — CMake target to build documentation.
- `extra-cmake-options` (optional) — Extra CMake configuration options.
- `extra-install` (optional) — Space-separated list of extra apt packages to install on the runner.
- `docs_source_dir` (optional) — Directory containing generated documentation. Default: `./docs`.

Behavior
--------
- `generate-docs` job checks out the repository and uses the `generate-doc` composite action to build documentation.
- `deploy` job runs `actions/deploy-pages@v4` to deploy the built site to GitHub Pages. It sets the `github-pages` environment and exposes the deployed page URL.

Usage Example (call from another workflow)
-----------------------------------------
```yaml
uses: stormbytepp/githubactions/.github/workflows/generate-and-deploy-docs.yml@master
with:
  doc_target: my_docs_target
  docs_source_dir: ./docs
```

Publishing Notes
----------------
- This reusable workflow requires the following permissions set at the workflow level that calls it:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write
```

External actions used
---------------------
- `actions/checkout@v4`
- `actions/deploy-pages@v4`

License
-------
This repository is licensed under the MIT License — see `LICENSE.txt` at the repository root.
