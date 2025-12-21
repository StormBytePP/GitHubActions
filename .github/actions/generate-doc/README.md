# Generate and Upload Documentation

Description
-----------
Composite action that builds project documentation and uploads it as a GitHub Pages artifact. It checks out the repository, installs a toolchain (with docs tools if requested), optionally installs extra APT packages, builds documentation via a CMake target, runs Jekyll to prepare the site, and uploads the pages artifact.

Author
------
David C. Manuelda <StormByte@gmail.com>

Branding
--------
Icon: help-circle
Color: white

Inputs
------
- `doc_target` (required) — CMake target name to build documentation.
- `docs_source_dir` (optional) — Directory that contains generated documentation (relative to workspace). Default: `./docs`.
- `extra-cmake-options` (optional) — Extra options passed to CMake configure step.
- `extra-install` (optional) — Space-separated list of extra apt packages to install on the runner (cached).

Behavior
--------
- Checks out the repository with submodules and full history.
- Invokes `install-toolchain` action to set up a compiler and (optionally) documentation tools.
- If `extra-install` is set, computes a cache key and installs the listed apt packages via `install-cached`.
- Configures and builds the specified CMake `doc_target` (Ninja generator, clang by default in the action).
- Runs Jekyll to build the pages site and uploads the Pages artifact using `actions/upload-pages-artifact@v3`.


Usage
-----
Reference the action by repository:

```yaml
uses: stormbytepp/githubactions/.github/actions/generate-doc@master
with:
  doc_target: my_docs_target
  docs_source_dir: ./docs
  extra-cmake-options: '-DUSE_BUNDLED=ON'
```

External actions used
---------------------
- `actions/checkout@v4`
- `ashutoshvarma/action-cmake-build@master`
- `actions/jekyll-build-pages@v1`
- `actions/upload-pages-artifact@v3`

License
-------
This repository is licensed under the MIT License — see `LICENSE.txt` at the repository root.
