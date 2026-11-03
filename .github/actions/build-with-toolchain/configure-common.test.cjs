const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { test } = require("node:test");

const helper = path.join(__dirname, "configure-common.sh");
const defaults = {
  CMAKE_OPTIONS: "",
  COMPILER: "gcc",
  CXX_STDLIB: "libstdc++",
  CFLAGS: "",
  CXXFLAGS: "",
  CPU_FLAGS: "",
  PGO: "",
  LTO: "",
  INSTALL_PREFIX: ""
};

function run(functionName, overrides = {}) {
  const script = [
    'source "$1"',
    functionName,
    'for arg in "${CONFIGURE_ARGS[@]}"; do printf "%s\\0" "$arg"; done'
  ].join("\n");
  return spawnSync("bash", ["-euo", "pipefail", "-c", script, "test", helper], {
    env: { ...process.env, ...defaults, ...overrides },
    encoding: "utf8"
  });
}

function runWithFlags(overrides = {}) {
  const script = [
    'source "$1"',
    "prepare_cmake_options",
    'printf "CFLAGS=%s\\0CXXFLAGS=%s\\0" "$CFLAGS" "$CXXFLAGS"',
    'for arg in "${CONFIGURE_ARGS[@]}"; do printf "%s\\0" "$arg"; done'
  ].join("\n");
  return spawnSync("bash", ["-euo", "pipefail", "-c", script, "test", helper], {
    env: { ...process.env, ...defaults, ...overrides },
    encoding: "utf8"
  });
}

function args(result) {
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? result.stdout.split("\0").slice(0, -1) : [];
}

test("empty options do not produce an empty CMake argument", () => {
  assert.deepEqual(args(run("prepare_cmake_options")), []);
});

test("quoted options and CXXFLAGS survive standard-library selection", () => {
  const result = run("prepare_cmake_options", {
    COMPILER: "clang",
    CXX_STDLIB: "libc++",
    CXXFLAGS: "-O0 -Wall",
    CMAKE_OPTIONS: '-DNAME="a value with spaces"'
  });
  assert.deepEqual(args(result), [
    "-DNAME=a value with spaces",
    "-DCMAKE_CXX_FLAGS=-O0 -Wall -stdlib=libc++",
    "-DCMAKE_CXX_STANDARD_LIBRARIES=-stdlib=libc++"
  ]);
});

test("existing CMake C++ flags are extended without duplicate definitions", () => {
  const result = run("prepare_cmake_options", {
    COMPILER: "clang",
    CXX_STDLIB: "libstdc++",
    CMAKE_OPTIONS: '-DCMAKE_CXX_FLAGS=-O0 -DCMAKE_CXX_STANDARD_LIBRARIES="-pthread"'
  });
  assert.deepEqual(args(result), [
    "-DCMAKE_CXX_FLAGS=-O0 -stdlib=libstdc++",
    "-DCMAKE_CXX_STANDARD_LIBRARIES=-pthread -stdlib=libstdc++"
  ]);
});

test("conflicting CXXFLAGS and standard-library options fail", () => {
  for (const overrides of [
    { CXXFLAGS: "-stdlib=libstdc++" },
    { CMAKE_OPTIONS: "-DCMAKE_CXX_FLAGS=-stdlib=libstdc++" },
    { CMAKE_OPTIONS: "-DCMAKE_CXX_STANDARD_LIBRARIES=-stdlib=libstdc++" }
  ]) {
    const result = run("prepare_cmake_options", {
      COMPILER: "clang",
      CXX_STDLIB: "libc++",
      ...overrides
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /different C\+\+ standard library/);
  }
});

test("PGO and LTO accept equivalent CMake boolean spellings", () => {
  const result = run("prepare_cmake_options", {
    PGO: "true",
    LTO: "false",
    CMAKE_OPTIONS: "-DENABLE_PGO:BOOL=YES -DENABLE_LTO=0"
  });
  assert.deepEqual(args(result), ["-DENABLE_PGO:BOOL=YES", "-DENABLE_LTO=0"]);
});

test("PGO and LTO are added only when not already specified", () => {
  const result = run("prepare_cmake_options", {
    PGO: "false",
    LTO: "true",
    INSTALL_PREFIX: "install directory"
  });
  assert.deepEqual(args(result), [
    "-DENABLE_PGO=OFF",
    "-DENABLE_LTO=ON",
    "-DCMAKE_INSTALL_PREFIX=install directory"
  ]);
});

test("the last repeated setting controls conflict detection", () => {
  const ok = run("prepare_cmake_options", {
    PGO: "true",
    CMAKE_OPTIONS: "-DENABLE_PGO=OFF -DENABLE_PGO=ON"
  });
  assert.equal(ok.status, 0, ok.stderr);
  const conflict = run("prepare_cmake_options", {
    PGO: "false",
    CMAKE_OPTIONS: "-DENABLE_PGO=OFF -DENABLE_PGO=ON"
  });
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /conflicts/);
});

test("split -D definitions preserve C++ flags and detect PGO conflicts", () => {
  const result = run("prepare_cmake_options", {
    COMPILER: "clang",
    CXX_STDLIB: "libc++",
    PGO: "false",
    CMAKE_OPTIONS: '-D CMAKE_CXX_FLAGS="-g -O0" -D ENABLE_PGO=OFF'
  });
  assert.deepEqual(args(result), [
    "-DCMAKE_CXX_FLAGS=-g -O0 -stdlib=libc++",
    "-DENABLE_PGO=OFF",
    "-DCMAKE_CXX_STANDARD_LIBRARIES=-stdlib=libc++"
  ]);
  const conflict = run("prepare_cmake_options", {
    PGO: "true",
    CMAKE_OPTIONS: "-D ENABLE_PGO=OFF"
  });
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /conflicts/);
});

test("invalid booleans and malformed quoting fail explicitly", () => {
  for (const options of ["-DENABLE_LTO=perhaps", "-DFOO='unterminated"]) {
    const result = run("prepare_cmake_options", { LTO: "true", CMAKE_OPTIONS: options });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /::error::/);
  }
});

test("the shared parser preserves quoted CTest arguments", () => {
  const result = run(
    'parse_action_arguments "$CTEST_OPTIONS" "ctest-options"; CONFIGURE_ARGS=("${PARSED_ARGS[@]}")',
    { CTEST_OPTIONS: '--output-on-failure -R "test name"' }
  );
  assert.deepEqual(args(result), ["--output-on-failure", "-R", "test name"]);
});

test("cpu-baseline is appended to CFLAGS, CXXFLAGS and explicit CMake flags", () => {
  const plain = runWithFlags({ CPU_FLAGS: "-march=x86-64-v3", CFLAGS: "-pipe" });
  assert.deepEqual(args(plain), ["CFLAGS=-pipe -march=x86-64-v3", "CXXFLAGS=-march=x86-64-v3"]);
  assert.match(plain.stderr, /CPU baseline: -march=x86-64-v3/);

  const explicit = runWithFlags({
    CPU_FLAGS: "-march=armv8.2-a",
    COMPILER: "clang",
    CXX_STDLIB: "libc++",
    CMAKE_OPTIONS: '-DCMAKE_C_FLAGS:STRING="-g" -DCMAKE_CXX_FLAGS= -DCMAKE_C_FLAGS_RELEASE=-O2'
  });
  assert.deepEqual(args(explicit), [
    "CFLAGS=-march=armv8.2-a",
    "CXXFLAGS=-march=armv8.2-a -stdlib=libc++",
    "-DCMAKE_C_FLAGS:STRING=-g -march=armv8.2-a",
    "-DCMAKE_CXX_FLAGS=-march=armv8.2-a -stdlib=libc++",
    "-DCMAKE_C_FLAGS_RELEASE=-O2",
    "-DCMAKE_CXX_STANDARD_LIBRARIES=-stdlib=libc++"
  ]);

  const implicit = runWithFlags({ CPU_FLAGS: "-march=x86-64-v3", COMPILER: "clang", CXX_STDLIB: "libc++" });
  assert.ok(args(implicit).includes("-DCMAKE_CXX_FLAGS=-march=x86-64-v3 -stdlib=libc++"));
});

test("an explicit CPU selection disables cpu-baseline with a warning", () => {
  for (const overrides of [
    { CFLAGS: "-march=native" },
    { CXXFLAGS: "-mcpu=neoverse-n1" },
    { CMAKE_OPTIONS: "-DCMAKE_CXX_FLAGS_RELEASE=-march=znver4" },
    { CMAKE_OPTIONS: '-D CMAKE_C_FLAGS="/arch:AVX2"' }
  ]) {
    const result = runWithFlags({ CPU_FLAGS: "-march=x86-64-v3", ...overrides });
    const values = args(result);
    assert.ok(!values.some(value => value.includes("x86-64-v3")), values.join(" | "));
    assert.match(result.stderr, /::warning::.*already selects a target CPU/);
  }
});

test("empty cpu-baseline leaves flags untouched", () => {
  const result = runWithFlags({ CFLAGS: "-pipe", CMAKE_OPTIONS: "-DCMAKE_C_FLAGS=-g" });
  assert.deepEqual(args(result), ["CFLAGS=-pipe", "CXXFLAGS=", "-DCMAKE_C_FLAGS=-g"]);
});
