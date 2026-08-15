# Generate Documentation

Composite GitHub Action that builds project documentation and prepares a Jekyll site under `./_site`.

It does **not** upload the Pages artifact; that is handled by the calling workflow (e.g. `generate-and-deploy-docs`).

## Author

David C. Manuelda  
[StormByte@gmail.com](mailto:StormByte@gmail.com)

## Branding

| Property | Value         |
|----------|---------------|
| Icon     | `help-circle` |
| Color    | `white`       |

## Inputs

| Name                  | Required | Default   | Description |
|-----------------------|----------|-----------|-------------|
| `doc_target`          | **Yes**  | —         | CMake target used to build the documentation |
| `docs_source_dir`     | No       | `./docs`  | Directory containing documentation source for Jekyll |
| `extra-cmake-options` | No       | `""`      | Extra options passed to the CMake configure step |
| `extra-install`       | No       | `""`      | Space-separated list of extra APT packages to install (cached) |

## Behavior

1. Checks out the repository with **cached submodules** (`checkout-cached`, full history, recursive).
2. Installs a **clang** toolchain via `install-toolchain` with documentation tools enabled (`doxygen`, `graphviz`).
3. If `extra-install` is set, installs those packages via `install-cached`.
4. Configures the project with **CMake + Ninja** (Release) and builds the given `doc_target`.
5. Runs **Jekyll** (`actions/jekyll-build-pages`) with `source` = `docs_source_dir` and `destination` = `./_site`.

## Usage

```yaml
- uses: stormbytepp/githubactions/.github/actions/generate-doc@master
  with:
    doc_target: my_docs_target
    docs_source_dir: ./docs
    extra-cmake-options: -DENABLE_DOC=ON -DWITH_STORMBYTE=BUNDLED
```

Typical full flow (artifact + deploy) uses the reusable workflow:

```yaml
jobs:
  docs:
    uses: stormbytepp/githubactions/.github/workflows/generate-and-deploy-docs.yml@master
    with:
      doc_target: my_docs_target
      docs_output_dir: ./_site
```

## Notes

- Requires `permissions: actions: write` on the job if submodule caches should be saved (`checkout-cached`).
- The Pages artifact is **not** uploaded by this action; upload `docs_output_dir` (usually `./_site`) in the caller.

## External actions used

- `stormbytepp/githubactions/.github/actions/checkout-cached`
- `stormbytepp/githubactions/.github/actions/install-toolchain`
- `stormbytepp/githubactions/.github/actions/install-cached`
- `actions/jekyll-build-pages@v1`

## License

This repository is licensed under the **MIT License**.  
See [`LICENSE.txt`](LICENSE.txt) at the repository root for the full text.
