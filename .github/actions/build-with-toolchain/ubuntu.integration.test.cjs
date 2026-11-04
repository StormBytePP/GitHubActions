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
      "set(CMAKE_CXX_STANDARD 20)",
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
      "if(PROBE_EXPECT_LIBSTDCPP16)",
      "  add_library(stdlib_probe OBJECT stdlib-probe.cpp)",
      "endif()",
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
      "if(PROBE_LINK_GCC_LIBRARY)",
      "  add_executable(gcc_library_test ../probe-test.cpp)",
      '  target_link_libraries(gcc_library_test PRIVATE "${CMAKE_SOURCE_DIR}/install-gcc/lib/libprobe.so")',
      '  add_test(NAME gcc_library_test COMMAND "$<TARGET_FILE:gcc_library_test>")',
      "endif()",
      ""
    ].join("\n"));
    fs.writeFileSync(path.join(workspace, "probe.cpp"), [
      "#include <atomic>",
      "#include <cstdint>",
      "#include <string>",
      "static std::atomic<std::uint64_t> gate{0};",
      'extern "C" int probe(const char* value) { gate.notify_all(); gate.wait(1); std::string text(value); text += "probe"; return text.size(); }',
      ""
    ].join("\n"));
    fs.writeFileSync(path.join(workspace, "probe-test.cpp"), [
      "#include <cstdlib>",
      "#include <iostream>",
      "#include <string>",
      'extern "C" int probe(const char*);',
      'int main() {',
      '  const char* cxx = std::getenv("CXX");',
      '  const char* expected = std::getenv("ACTION_TEST_CXX");',
      '  if (!cxx || !expected || std::string(cxx) != expected) return 2;',
      '  std::cout << "probe\\n";',
      '  return probe("go") == 7 ? 0 : 1;',
      '}',
      ""
    ].join("\n"));
    fs.writeFileSync(path.join(workspace, "stdlib-probe.cpp"), [
      "#include <bits/c++config.h>",
      "#if !defined(_GLIBCXX_RELEASE) || _GLIBCXX_RELEASE < 16",
      '#error "Clang must use GCC 16 or newer libstdc++ headers"',
      "#endif",
      ""
    ].join("\n"));
    if (actualPgo) fs.copyFileSync(actualPgo, path.join(workspace, "pgo.cmake"));
    fs.writeFileSync(path.join(root, "bin", "sudo"), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });

    fs.writeFileSync(path.join(root, "resolve-clang.sh"),
      step(toolchainAction, "Resolve versions and validate toolchain", {
        "inputs.toolchain": "clang", "inputs.version": "", "runner.os": "Linux", "runner.arch": arch
      }));
    for (const compiler of ["gcc", "clang"]) {
      fs.writeFileSync(path.join(root, `${compiler}-alternatives.sh`),
        step(toolchainAction, "Register compiler alternatives (Linux)", {
          "inputs.toolchain": compiler, "env.GCC_VERSION": "16", "env.CLANG_VERSION": "22"
        }));
    }
    fs.writeFileSync(path.join(root, "linker.sh"),
      step(buildAction, "Setup LLVM linker tools (Linux clang / clang-libc++)"));
    fs.writeFileSync(path.join(root, "clang-library-path.sh"),
      step(toolchainAction, "Add LLVM library directory (Linux clang)"));
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
export GITHUB_PATH="$TEST_ROOT/github-path" GITHUB_ENV="$TEST_ROOT/github-env"
export GITHUB_OUTPUT="$TEST_ROOT/toolchain-output"
bash "$TEST_ROOT/resolve-clang.sh"
read -r gcc_package gxx_package < <(sed -n 's/^gcc_packages=//p' "$GITHUB_OUTPUT")
if [[ -z "$gcc_package" || -z "$gxx_package" ]]; then
  echo "Clang did not request GCC and libstdc++ development packages" >&2
  exit 1
fi
apt-get update -o Acquire::http::Timeout=15 -o Acquire::Retries=1 -qq
if ! DEBIAN_FRONTEND=noninteractive apt-get install -qq -y --no-install-recommends \\
  ninja-build build-essential cmake pkg-config autoconf automake libtool perl openssl nasm yasm bison flex \\
  ca-certificates curl git zip unzip xz-utils doxygen graphviz "$gcc_package" "$gxx_package" clang-22 clang++-22 lld-22 llvm-22 \\
  libclang-rt-22-dev libc++-22-dev libc++abi-22-dev libunwind-22-dev > "$TEST_ROOT/apt.log" 2>&1; then
  tail -n 40 "$TEST_ROOT/apt.log" >&2
  exit 1
fi
export PATH="$TEST_ROOT/bin:$PATH" GCC_VERSION=16 CLANG_VERSION=22
export ACTION_PATH="$ACTION_DIR" CMAKE_OPTIONS='-DPROBE_QUOTED="hello world"'
export BUILDMASTER_DATADIR="" PGO=true LTO=true CPU_FLAGS="$TEST_CPU_FLAGS"
cd "$TEST_WORKSPACE"
bash "$TEST_ROOT/gcc-alternatives.sh"
export COMPILER=gcc CXX_STDLIB=libstdc++ INSTALL_PREFIX="$TEST_WORKSPACE/install-gcc"
export CC=gcc CXX=g++ ACTION_TEST_CXX=g++
bash "$TEST_ROOT/configure-gcc.sh"
cmake --build build-gcc -j"$(nproc)"
if [ "$ACTUAL_PGO" != true ]; then ctest --test-dir build-gcc --no-tests=error --output-on-failure; fi
cmake --install build-gcc
readelf -d install-gcc/lib/libprobe.so | grep -F 'libstdc++.so'
readelf --version-info install-gcc/lib/libprobe.so > "$TEST_ROOT/gcc-probe-versions"
grep -Fq 'GLIBCXX_3.4.35' "$TEST_ROOT/gcc-probe-versions"
bash "$TEST_ROOT/clang-alternatives.sh"
export PATH="/usr/lib/llvm-22/bin:$PATH"
bash "$TEST_ROOT/linker.sh"
bash "$TEST_ROOT/clang-library-path.sh"
while IFS= read -r setting; do export "$setting"; done < "$GITHUB_ENV"
export COMPILER=clang CXX_STDLIB=libstdc++ INSTALL_PREFIX="$TEST_WORKSPACE/install-clang-stdcxx"
export CC=clang CXX=clang++-22 ACTION_TEST_CXX=clang++-22
export CMAKE_OPTIONS='-DPROBE_QUOTED="hello world" -DPROBE_EXPECT_LIBSTDCPP16=ON -DPROBE_LINK_GCC_LIBRARY=ON'
bash "$TEST_ROOT/configure-clang-stdcxx.sh"
cmake --build build-clang-stdcxx -j"$(nproc)"
if [ "$ACTUAL_PGO" != true ]; then ctest --test-dir build-clang-stdcxx --no-tests=error --output-on-failure; fi
cmake --install build-clang-stdcxx
readelf -d install-clang-stdcxx/lib/libprobe.so | grep -F 'libstdc++.so'
clang_stdlib="$(clang++-22 -print-file-name=libstdc++.so)"
if [[ ! -f "$clang_stdlib" ]]; then
  echo "Clang cannot locate libstdc++.so: $clang_stdlib" >&2
  exit 1
fi
readelf --version-info "$clang_stdlib" > "$TEST_ROOT/clang-libstdcxx-versions"
grep -Fq 'GLIBCXX_3.4.35' "$TEST_ROOT/clang-libstdcxx-versions"
if [ "$ACTUAL_PGO" = true ]; then
  gcc_library_test=build-clang-stdcxx/pgo-instr/test/gcc_library_test
else
  gcc_library_test=build-clang-stdcxx/test/gcc_library_test
fi
dependencies="$(ldd "$gcc_library_test")"
if ! grep -Fq "$TEST_WORKSPACE/install-gcc/lib/libprobe.so" <<< "$dependencies"; then
  echo "Clang test did not load the GCC-built probe" >&2
  exit 1
fi
runtime_stdlib="$(awk '$1 == "libstdc++.so.6" && $2 == "=>" {print $3}' <<< "$dependencies")"
if [[ ! -f "$runtime_stdlib" ]]; then
  echo "Cannot locate the libstdc++ loaded at runtime: $runtime_stdlib" >&2
  exit 1
fi
readelf --version-info "$runtime_stdlib" > "$TEST_ROOT/runtime-libstdcxx-versions"
grep -Fq 'GLIBCXX_3.4.35' "$TEST_ROOT/runtime-libstdcxx-versions"
export CXX_STDLIB=libc++ INSTALL_PREFIX="$TEST_WORKSPACE/install-clang-cxx"
export CC=clang CXX=clang++-22 ACTION_TEST_CXX=clang++-22
export CMAKE_OPTIONS='-DPROBE_QUOTED="hello world"'
bash "$TEST_ROOT/configure-clang-cxx.sh"
cmake --build build-clang-cxx -j"$(nproc)"
if [ "$ACTUAL_PGO" != true ]; then ctest --test-dir build-clang-cxx --no-tests=error --output-on-failure; fi
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
