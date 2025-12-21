# Cache and Setup Compiler Toolchain

Description
-----------
Composite action that installs and caches compiler toolchains (gcc, clang, and clang with libc++) on GitHub Actions runners. It selects toolchains per-OS, registers alternatives on Linux, and exports selected compilers as outputs and environment variables.

Author
------
David C. Manuelda <StormByte@gmail.com>

Branding
--------
Icon: settings
Color: green

Inputs
------
- `toolchain` (required) — Toolchain name to install. Supported values: `gcc`, `clang`, `clang-libc++` (Linux) and `msvc` (Windows).
- `docs` (optional) — `true` or `false`. When `true` the action installs documentation tools (Doxygen, Sphinx) on Linux runners.

Outputs
-------
- `c_compiler` — Path to the chosen C compiler (`/usr/bin/gcc`, `/usr/bin/clang`, or `cl`).
- `cxx_compiler` — Path to the chosen C++ compiler (`/usr/bin/g++`, `/usr/bin/clang++`, or `cl`).

Behavior and Notes
------------------
- Validates `toolchain` input on Linux and Windows and fails early for unsupported values.
- Installs toolchains and registers `update-alternatives` on Linux to point `/usr/bin/gcc`, `/usr/bin/clang`, etc., to the installed versions.
- On Windows it uses `ilammy/msvc-dev-cmd` to prepare the MSVC environment and attempts to add the Python Scripts folder to PATH.
- Exports `CC` and `CXX` to the job environment via `$GITHUB_ENV`.

Usage
-----
Reference the action by repository:

```yaml
uses: stormbytepp/githubactions/.github/actions/install-toolchain@master
with:
  toolchain: gcc
```

External actions used
---------------------
- `ashutoshvarma/setup-ninja@master`
- `actions/setup-python@v5`
- `ilammy/msvc-dev-cmd@v1`

License
-------
This repository is licensed under the MIT License — see `LICENSE.txt` at the repository root.
