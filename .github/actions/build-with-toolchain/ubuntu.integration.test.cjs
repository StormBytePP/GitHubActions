const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { step } = require("./test-helpers.cjs");

const enabled = process.env.RUN_UBUNTU_INTEGRATION === "1";
const actualPgo = process.env.STORMBYTE_PGO_CMAKE;
const actions = path.resolve(__dirname, "..");
const buildAction = path.join(__dirname, "action.yml");
const toolchainAction = path.join(actions, "install-toolchain", "action.yml");
const docsAction = path.join(actions, "generate-doc", "action.yml");

test("Ubuntu toolchain, build and documentation steps work together", {
  skip: !enabled && "set RUN_UBUNTU_INTEGRATION=1 to run Docker integration tests",
  timeout: 600000
}, () => {
  const arch = { x64: "X64", arm64: "ARM64" }[process.arch];
  assert.ok(arch, `Unsupported native architecture: ${process.arch}`);
  const cpuFlags = { x64: "-march=x86-64-v3", arm64: "-march=armv8.2-a" }[process.arch];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stormbyte-ubuntu-test-"));
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  fs.mkdirSync(path.join(workspace, "test"));
  fs.mkdirSync(path.join(root, "bin"));
  try {
    fs.writeFileSync(path.join(workspace, "CMakeLists.txt"), [
      "cmake_minimum_required(VERSION 3.28)",
      "project(action_probe LANGUAGES C CXX)",
      'option(ENABLE_TEST "" ON)',
      'option(ENABLE_LTO "" OFF)',
      "set(CMAKE_INTERPROCEDURAL_OPTIMIZATION ${ENABLE_LTO})",
      actualPgo ? "include(pgo.cmake)" : [
        'option(ENABLE_PGO "" OFF)',
        'if(ENABLE_PGO AND CMAKE_CXX_COMPILER_ID MATCHES "Clang")',
        "  add_compile_options(-fprofile-instr-generate)",
        "  add_link_options(-fprofile-instr-generate)",
        "endif()"
      ].join("\n"),
      'if(NOT PROBE_QUOTED STREQUAL "hello world")',
      '  message(FATAL_ERROR "quoted CMake options were not preserved")',
      "endif()",
      "add_library(probe SHARED probe.cpp)",
      "install(TARGETS probe LIBRARY DESTINATION lib)",
      'add_custom_target(documentation COMMAND "${CMAKE_COMMAND}" -E touch "${CMAKE_BINARY_DIR}/docs-built")',
      "if(ENABLE_TEST)",
      "  enable_testing()",
      "  add_subdirectory(test)",
      "endif()",
      ""
    ].join("\n"));
    fs.writeFileSync(path.join(workspace, "test", "CMakeLists.txt"), [
      "add_executable(probe_test ../probe-test.cpp)",
      "target_link_libraries(probe_test PRIVATE probe)",
      'add_test(NAME probe_test COMMAND "$<TARGET_FILE:probe_test>")',
      ""
    ].join("\n"));
    fs.writeFileSync(path.join(workspace, "probe.cpp"),
      '#include <string>\nextern "C" int probe(const char* value) { std::string text(value); text += "probe"; return text.size(); }\n');
    fs.writeFileSync(path.join(workspace, "probe-test.cpp"),
      '#include <iostream>\nextern "C" int probe(const char*);\nint main() { std::cout << "probe\\n"; return probe("go") == 7 ? 0 : 1; }\n');
    if (actualPgo) fs.copyFileSync(actualPgo, path.join(workspace, "pgo.cmake"));
    fs.writeFileSync(path.join(root, "bin", "sudo"), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });

    for (const compiler of ["gcc", "clang"]) {
      fs.writeFileSync(path.join(root, `${compiler}-alternatives.sh`),
        step(toolchainAction, "Register compiler alternatives (Linux)", {
          "inputs.toolchain": compiler, "env.GCC_VERSION": "16", "env.CLANG_VERSION": "22"
        }));
    }
    fs.writeFileSync(path.join(root, "linker.sh"),
      step(buildAction, "Setup LLVM linker tools (Linux clang / clang-libc++)"));
    for (const [name, compiler] of [["gcc", "gcc"], ["clang-stdcxx", "clang"], ["clang-cxx", "clang"]]) {
      fs.writeFileSync(path.join(root, `configure-${name}.sh`),
        step(buildAction, "Configure CMake (Linux/macOS)", {
          "inputs.source-dir": ".", "inputs.build-type": "Release",
          "inputs.build-dir": `build-${name}`, "steps.options.outputs.compiler": compiler,
          "steps.options.outputs.compiler_cache_key": "", "runner.os": "Linux",
          "steps.toolchain.outputs.c_compiler": compiler,
          "steps.toolchain.outputs.cxx_compiler": compiler === "gcc" ? "g++" : "clang++"
        }));
    }
    fs.writeFileSync(path.join(root, "configure-docs.sh"), step(docsAction, "Configure CMake", {
      "github.workspace": workspace, "steps.toolchain.outputs.c_compiler": "clang",
      "steps.toolchain.outputs.cxx_compiler": "clang++"
    }));
    fs.writeFileSync(path.join(root, "build-docs.sh"), step(docsAction, "Build documentation target", {
      "github.workspace": workspace, "inputs.doc_target": "documentation"
    }));
    fs.writeFileSync(path.join(root, "run.sh"), `#!/bin/bash
set -euo pipefail
trap 'chown -R "$TEST_UID:$TEST_GID" "$TEST_ROOT"' EXIT
apt-get update -o Acquire::http::Timeout=15 -o Acquire::Retries=1 -qq
if ! DEBIAN_FRONTEND=noninteractive apt-get install -qq -y --no-install-recommends \\
  ninja-build build-essential cmake pkg-config autoconf automake libtool perl openssl nasm yasm bison flex \\
  ca-certificates curl git zip unzip xz-utils doxygen graphviz gcc-16 g++-16 clang-22 clang++-22 lld-22 llvm-22 \\
  libclang-rt-22-dev libc++-22-dev libc++abi-22-dev libunwind-22-dev > "$TEST_ROOT/apt.log" 2>&1; then
  tail -n 40 "$TEST_ROOT/apt.log" >&2
  exit 1
fi
export PATH="$TEST_ROOT/bin:$PATH" GCC_VERSION=16 CLANG_VERSION=22
export GITHUB_PATH="$TEST_ROOT/github-path" GITHUB_ENV="$TEST_ROOT/github-env"
export ACTION_PATH="$ACTION_DIR" CMAKE_OPTIONS='-DPROBE_QUOTED="hello world"'
export BUILDMASTER_DATADIR="" PGO=true LTO=true CPU_FLAGS="$TEST_CPU_FLAGS"
cd "$TEST_WORKSPACE"
bash "$TEST_ROOT/gcc-alternatives.sh"
export COMPILER=gcc CXX_STDLIB=libstdc++ INSTALL_PREFIX="$TEST_WORKSPACE/install-gcc"
bash "$TEST_ROOT/configure-gcc.sh"
cmake --build build-gcc -j"$(nproc)"
if [ "$ACTUAL_PGO" != true ]; then ctest --test-dir build-gcc --output-on-failure; fi
cmake --install build-gcc
readelf -d install-gcc/lib/libprobe.so | grep -F 'libstdc++.so'
bash "$TEST_ROOT/clang-alternatives.sh"
export PATH="/usr/lib/llvm-22/bin:$PATH"
bash "$TEST_ROOT/linker.sh"
while IFS= read -r setting; do export "$setting"; done < "$GITHUB_ENV"
export COMPILER=clang CXX_STDLIB=libstdc++ INSTALL_PREFIX="$TEST_WORKSPACE/install-clang-stdcxx"
bash "$TEST_ROOT/configure-clang-stdcxx.sh"
cmake --build build-clang-stdcxx -j"$(nproc)"
if [ "$ACTUAL_PGO" != true ]; then ctest --test-dir build-clang-stdcxx --output-on-failure; fi
cmake --install build-clang-stdcxx
readelf -d install-clang-stdcxx/lib/libprobe.so | grep -F 'libstdc++.so'
export CXX_STDLIB=libc++ INSTALL_PREFIX="$TEST_WORKSPACE/install-clang-cxx"
bash "$TEST_ROOT/configure-clang-cxx.sh"
cmake --build build-clang-cxx -j"$(nproc)"
if [ "$ACTUAL_PGO" != true ]; then ctest --test-dir build-clang-cxx --output-on-failure; fi
cmake --install build-clang-cxx
readelf -d install-clang-cxx/lib/libprobe.so | grep -F 'libc++.so'
export ACTION_PATH="$DOCS_DIR" EXTRA_CMAKE_OPTIONS='-DPROBE_QUOTED="hello world"'
doxygen --version
dot -V
bash "$TEST_ROOT/configure-docs.sh"
bash "$TEST_ROOT/build-docs.sh"
`);
    const env = {
      ...process.env,
      TEST_ROOT: root, TEST_WORKSPACE: workspace,
      TEST_UID: String(process.getuid()), TEST_GID: String(process.getgid()),
      ACTION_DIR: __dirname, DOCS_DIR: path.join(actions, "generate-doc"),
      ACTUAL_PGO: actualPgo ? "true" : "false",
      TEST_CPU_FLAGS: cpuFlags
    };
    const args = ["run", "--rm", "--network", "host", "-v", `${root}:${root}`,
      "-v", `${actions}:${actions}:ro`, "-w", workspace];
    for (const name of ["TEST_ROOT", "TEST_WORKSPACE", "TEST_UID", "TEST_GID", "ACTION_DIR", "DOCS_DIR", "ACTUAL_PGO", "TEST_CPU_FLAGS"]) {
      args.push("-e", name);
    }
    args.push("--entrypoint", "/bin/bash", "ubuntu:26.04", path.join(root, "run.sh"));
    const result = spawnSync("docker", args, {
      env, encoding: "utf8", timeout: 540000, maxBuffer: 8 * 1024 * 1024
    });
    assert.equal(result.status, 0,
      `${result.error || ""}\n${result.stdout.slice(-12000)}\n${result.stderr.slice(-4000)}`);
    for (const name of ["gcc", "clang-stdcxx", "clang-cxx"]) {
      assert.equal(fs.existsSync(path.join(workspace, `install-${name}`, "lib", "libprobe.so")), true);
      if (actualPgo) assert.equal(fs.existsSync(path.join(workspace, `build-${name}`, "pgo-data")), true);
      const cache = fs.readFileSync(path.join(workspace, `build-${name}`, "CMakeCache.txt"), "utf8");
      for (const lang of ["C", "CXX"]) {
        assert.match(cache, new RegExp(`^CMAKE_${lang}_FLAGS:STRING=.*${cpuFlags}`, "m"), `${name} ${lang}`);
      }
    }
    assert.equal(fs.existsSync(path.join(workspace, "build", "docs-built")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
