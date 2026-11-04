const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { step } = require("./test-helpers.cjs");

const enabled = process.env.RUN_ALPINE_INTEGRATION === "1";
const actualPgo = process.env.STORMBYTE_PGO_CMAKE;

test("Alpine builds and installs all compiler/runtime variants", {
  skip: !enabled && "set RUN_ALPINE_INTEGRATION=1 to run Docker integration tests",
  timeout: 900000
}, async t => {
  const arch = { x64: ["X64", "amd64"], arm64: ["ARM64", "arm64"] }[process.arch];
  assert.ok(arch, `Unsupported native architecture: ${process.arch}`);
  const cpuFlags = { x64: "-march=x86-64-v3", arm64: "-march=armv8.2-a" }[process.arch];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stormbyte-alpine-test-"));
  const workspace = path.join(root, "workspace");
  const temp = path.join(root, "runner-temp");
  fs.mkdirSync(workspace);
  fs.mkdirSync(temp);
  const server = spawn(process.execPath, ["-e", `
    const net = require("node:net");
    const server = net.createServer(socket => socket.end());
    server.listen(0, "127.0.0.1", () => console.log(server.address().port));
  `], { stdio: ["ignore", "pipe", "pipe"] });

  try {
    const [data] = await Promise.race([
      once(server.stdout, "data"),
      once(server, "exit").then(([code]) => { throw new Error(`test server exited: ${code}`); })
    ]);
    const port = data.toString().trim();

    fs.writeFileSync(path.join(workspace, "CMakeLists.txt"), [
      "cmake_minimum_required(VERSION 3.28)",
      "project(action_probe LANGUAGES C CXX)",
      'option(ENABLE_TEST "" ON)',
      'option(ENABLE_LTO "" OFF)',
      "set(CMAKE_INTERPROCEDURAL_OPTIMIZATION ${ENABLE_LTO})",
      actualPgo ? "include(pgo.cmake)" : [
        'option(ENABLE_PGO "" OFF)',
        'if(ENABLE_PGO AND CMAKE_CXX_COMPILER_ID MATCHES "Clang")',
        "  find_program(LLVM_PROFDATA llvm-profdata REQUIRED)",
        "  add_compile_options(-fprofile-instr-generate)",
        "  add_link_options(-fprofile-instr-generate)",
        "endif()"
      ].join("\n"),
      'if(NOT PROBE_QUOTED STREQUAL "hello world")',
      '  message(FATAL_ERROR "quoted CMake options were not preserved")',
      "endif()",
      "find_package(SQLite3 REQUIRED)",
      "foreach(tool nasm yasm flex bison perl openssl)",
      "  find_program(${tool}_PROGRAM ${tool} REQUIRED)",
      "endforeach()",
      "if(PROBE_DOCS)",
      "  find_program(ACTION_DOXYGEN doxygen REQUIRED)",
      "  find_program(ACTION_DOT dot REQUIRED)",
      "endif()",
      "if(PROBE_MESON)",
      "  find_program(ACTION_MESON meson REQUIRED)",
      "endif()",
      "find_program(ACTION_NINJA ninja REQUIRED)",
      'execute_process(COMMAND "${ACTION_NINJA}" --version OUTPUT_VARIABLE NINJA_VERSION OUTPUT_STRIP_TRAILING_WHITESPACE)',
      'if(NINJA_VERSION VERSION_LESS "1.10")',
      '  message(FATAL_ERROR "a Ninja-compatible build tool version 1.10 or newer is required")',
      "endif()",
      "add_library(probe SHARED probe.cpp)",
      "install(TARGETS probe LIBRARY DESTINATION lib)",
      "if(ENABLE_TEST)",
      "  enable_testing()",
      "  add_subdirectory(test)",
      "endif()",
      ""
    ].join("\n"));
    fs.mkdirSync(path.join(workspace, "test"));
    fs.writeFileSync(path.join(workspace, "test", "CMakeLists.txt"), [
      "add_executable(probe_test ../probe-test.cpp)",
      "target_link_libraries(probe_test PRIVATE probe)",
      'add_test(NAME "probe test" COMMAND sh "${CMAKE_SOURCE_DIR}/check-runtime.sh" $<TARGET_FILE:probe_test>)',
      ""
    ].join("\n"));
    fs.writeFileSync(path.join(workspace, "probe.cpp"),
      '#include <string>\nextern "C" int probe() { return std::string("probe").size(); }\n');
    fs.writeFileSync(path.join(workspace, "probe-test.cpp"), `
#include <arpa/inet.h>
#include <sys/socket.h>
#include <unistd.h>
#include <cstdlib>
#include <iostream>
#include <string>

extern "C" int probe();

int main() {
  if (probe() != 5) return 5;
  const char* host = std::getenv("MSSQL_HOST");
  const char* port = std::getenv("MSSQL_PORT");
  const char* extra = std::getenv("ACTION_TEST_ENV");
  const char* cxx = std::getenv("CXX");
  const char* expectedCxx = std::getenv("ACTION_TEST_CXX");
  if (!host || std::string(host) != "127.0.0.1" || !port || !extra || std::string(extra) != "forwarded"
      || !cxx || !expectedCxx || std::string(cxx) != expectedCxx) return 1;
  sockaddr_in address{};
  address.sin_family = AF_INET;
  address.sin_port = htons(std::atoi(port));
  if (inet_pton(AF_INET, host, &address.sin_addr) != 1) return 2;
  int fd = socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return 3;
  int result = connect(fd, reinterpret_cast<sockaddr*>(&address), sizeof(address));
  close(fd);
  std::cout << "localhost and environment verified\\n";
  return result == 0 ? 0 : 4;
}
`);
    fs.writeFileSync(path.join(workspace, "check-runtime.sh"), `#!/bin/sh
set -eu
case "$EXPECTED_STDLIB" in
  libc++) library='libc++.so' ;;
  libstdc++) library='libstdc++.so' ;;
  *) exit 1 ;;
esac
readelf -d "$1" | grep -F "$library" >/dev/null
exec "$1"
`);
    if (actualPgo) fs.copyFileSync(actualPgo, path.join(workspace, "pgo.cmake"));

    const script = step(path.join(__dirname, "action.yml"), "Build in Alpine (musl)");
    for (const variant of [
      { name: "gcc-libstdcxx", compiler: "gcc", cxx: "g++", version: "15", stdlib: "libstdc++", pgo: false, docs: true, meson: true },
      { name: "gcc-config-only", compiler: "gcc", cxx: "g++", version: "15", stdlib: "libstdc++", pgo: false, install: false },
      { name: "gcc-pgo-libstdcxx", compiler: "gcc", cxx: "g++", version: "15", stdlib: "libstdc++", pgo: true },
      { name: "clang-libstdcxx", compiler: "clang", cxx: "clang++-22", version: "22", stdlib: "libstdc++", pgo: true },
      { name: "clang-libcxx", compiler: "clang", cxx: "clang++-22", version: "22", stdlib: "libc++", pgo: true }
    ]) {
      const buildDir = `build-${variant.name}`;
      const installDir = variant.install === false
        ? "/usr/local/configuration-only" : path.join(workspace, `install-${variant.name}`);
      const datadir = path.join(temp, "buildmaster");
      fs.mkdirSync(path.join(datadir, "tmp"), { recursive: true });
      fs.writeFileSync(path.join(datadir, "tmp", "stale"), "stale");
      const env = {
        ...process.env,
        DOCKER_ARCH: arch[1], HOST_ARCH: arch[0], ACTION_PATH: __dirname,
        COMPILER: variant.compiler, COMPILER_VERSION: variant.version, CXX_STDLIB: variant.stdlib,
        CMAKE_OPTIONS: `-DPROBE_QUOTED="hello world" -DPROBE_DOCS=${variant.docs ? "ON" : "OFF"} -DPROBE_MESON=${variant.meson ? "ON" : "OFF"}`,
        BUILD_TYPE: "Release",
        SOURCE_DIR: ".", BUILD_DIR: buildDir, BUILD_TARGET: "",
        CTEST_ENABLED: variant.pgo && actualPgo ? "false" : "true",
        CTEST_OPTIONS: '--output-on-failure -R "probe test"',
        INSTALL_ENABLED: String(variant.install !== false), INSTALL_PREFIX: installDir, DEPLOY: "false",
        PGO: String(variant.pgo), LTO: String(variant.pgo), CPU_FLAGS: cpuFlags,
        DOCS: String(variant.docs === true), MESON: String(variant.meson === true),
        EXTRA_PACKAGES: "sqlite-dev", CONTAINER_ENV: "ACTION_TEST_ENV ACTION_TEST_CXX EXPECTED_STDLIB",
        CACHE_ENABLED: "true", BUILDMASTER_DATADIR: datadir,
        RUNNER_TEMP: temp, GITHUB_WORKSPACE: workspace,
        MSSQL_HOST: "127.0.0.1", MSSQL_PORT: port,
        ACTION_TEST_ENV: "forwarded", ACTION_TEST_CXX: variant.cxx, EXPECTED_STDLIB: variant.stdlib
      };
      const result = spawnSync("bash", ["-euo", "pipefail", "-c", script], {
        cwd: workspace, env, encoding: "utf8", timeout: 300000, maxBuffer: 8 * 1024 * 1024
      });
      assert.equal(result.status, 0,
        `${variant.name} failed: ${result.error || ""}\n${result.stdout.slice(-12000)}\n${result.stderr.slice(-4000)}`);
      assert.equal(fs.existsSync(path.join(datadir, "tmp")), false);
      const flagsCache = fs.readFileSync(path.join(workspace, buildDir, "CMakeCache.txt"), "utf8");
      for (const lang of ["C", "CXX"]) {
        assert.match(flagsCache, new RegExp(`^CMAKE_${lang}_FLAGS:STRING=.*${cpuFlags}`, "m"), `${variant.name} ${lang}`);
      }
      if (variant.install === false) {
        const cache = fs.readFileSync(path.join(workspace, buildDir, "CMakeCache.txt"), "utf8");
        assert.match(cache, /CMAKE_INSTALL_PREFIX:PATH=\/usr\/local\/configuration-only/);
      } else {
        const installed = path.join(installDir, "lib", "libprobe.so");
        assert.equal(fs.existsSync(installed), true);
        assert.equal(fs.statSync(installed).uid, process.getuid());
        assert.equal(fs.statSync(installed).gid, process.getgid());
      }
      if (variant.pgo && actualPgo) {
        assert.match(result.stdout, /ENABLE_PGO: profile ready/);
        const profileDir = path.join(workspace, buildDir, "pgo-data");
        if (variant.compiler === "clang") {
          assert.equal(fs.existsSync(path.join(profileDir, "default.profdata")), true);
        } else {
          assert.ok(fs.readdirSync(profileDir, { recursive: true }).some(name => name.endsWith(".gcda")));
        }
      }
      const finalCheck = variant.install === false ? "configuration-only prefix" : "install";
      t.diagnostic(`${variant.name}: build, tests/training, networking, environment and ${finalCheck} passed`);
    }
  } finally {
    server.kill("SIGTERM");
    fs.rmSync(root, { recursive: true, force: true });
  }
});
