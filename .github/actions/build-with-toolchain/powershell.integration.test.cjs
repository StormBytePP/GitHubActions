const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { step } = require("./test-helpers.cjs");

const enabled = process.env.RUN_POWERSHELL_INTEGRATION === "1";
const action = path.join(__dirname, "action.yml");

test("PowerShell configure and CTest preserve argument arrays and Windows paths", {
  skip: !enabled && "set RUN_POWERSHELL_INTEGRATION=1 to run PowerShell container tests",
  timeout: 300000
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stormbyte-pwsh-test-"));
  const bin = path.join(root, "bin");
  fs.mkdirSync(path.join(bin, "MSVC"), { recursive: true });
  try {
    const configure = step(action, "Configure CMake (Windows)", {
      "steps.options.outputs.compiler": "msvc",
      "inputs.source-dir": "C:/project source",
      "inputs.build-type": "Release",
      "inputs.build-dir": "C:/project build",
      "steps.toolchain.outputs.c_compiler": "cl",
      "steps.toolchain.outputs.cxx_compiler": "cl",
      "steps.options.outputs.compiler_cache_key": "",
      "github.action_path": __dirname
    });
    const ctest = step(action, "Run tests (Windows)", {
      "inputs.build-dir": "C:/project build"
    });
    fs.writeFileSync(path.join(root, "configure.ps1"), configure);
    fs.writeFileSync(path.join(root, "ctest.ps1"), ctest);
    const stub = `#!/usr/bin/python3
import json, os, sys
with open(os.environ["CAPTURE_FILE"], "w", encoding="utf-8") as output:
    json.dump(sys.argv[1:], output)
with open(os.environ["CAPTURE_FILE"] + ".env", "w", encoding="utf-8") as output:
    json.dump({name: os.environ.get(name, "") for name in ("CFLAGS", "CXXFLAGS")}, output)
`;
    fs.writeFileSync(path.join(bin, "cmake"), stub, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "ctest"), stub, { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "MSVC", "link.exe"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.writeFileSync(path.join(root, "run.sh"), `#!/bin/sh
set -eu
apt-get update -o Acquire::http::Timeout=15 -o Acquire::Retries=1 -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends python3
ln -s /usr/bin/python3 "$TEST_BIN/python"
export PATH="$TEST_BIN:$TEST_BIN/MSVC:$PATH"
export CAPTURE_FILE="$TEST_ROOT/configure.json"
pwsh -NoLogo -NoProfile -File "$TEST_ROOT/configure.ps1" > "$TEST_ROOT/configure.log" 2>&1
export CAPTURE_FILE="$TEST_ROOT/ctest.json"
pwsh -NoLogo -NoProfile -File "$TEST_ROOT/ctest.ps1" > "$TEST_ROOT/ctest.log" 2>&1
export CAPTURE_FILE="$TEST_ROOT/explicit-cpu.json"
CFLAGS="/arch:AVX2" pwsh -NoLogo -NoProfile -File "$TEST_ROOT/configure.ps1" > "$TEST_ROOT/explicit-cpu.log" 2>&1
export CONFIGURE_OPTIONS="-D ENABLE_PGO=OFF" PGO=true
if pwsh -NoLogo -NoProfile -File "$TEST_ROOT/configure.ps1" > "$TEST_ROOT/conflict.log" 2>&1; then
  echo "PGO conflict was not rejected" >&2
  exit 1
fi
export CONFIGURE_OPTIONS="-DFOO='unterminated" PGO=
if pwsh -NoLogo -NoProfile -File "$TEST_ROOT/configure.ps1" > "$TEST_ROOT/quoting.log" 2>&1; then
  echo "Malformed quoting was not rejected" >&2
  exit 1
fi
`);
    const env = {
      ...process.env,
      TEST_ROOT: root, TEST_BIN: bin, GITHUB_ENV: path.join(root, "github-env"),
      ACTION_PATH: __dirname,
      CONFIGURE_OPTIONS: '-DNAME="quoted spaces" -DPREFIX=C:\\Library\\include -DQUOTED="C:\\Program Files\\SDK" -D ENABLE_PGO:BOOL=YES -D ENABLE_LTO=OFF -D CMAKE_CXX_FLAGS="/W4"',
      CTEST_OPTIONS: '--output-on-failure -R "probe test" -E "bad pattern"',
      PGO: "true", LTO: "false",
      CPU_FLAGS: "/arch:AVX", CFLAGS: "/nologo",
      INSTALL_PREFIX: "C:\\Install Dir", BUILDMASTER_DATADIR: "C:\\BuildMaster"
    };
    const dockerEnv = ["TEST_ROOT", "TEST_BIN", "GITHUB_ENV", "CONFIGURE_OPTIONS",
      "CTEST_OPTIONS", "PGO", "LTO", "CPU_FLAGS", "CFLAGS", "INSTALL_PREFIX", "BUILDMASTER_DATADIR", "ACTION_PATH"];
    const args = ["run", "--rm", "--network", "host", "-v", `${root}:${root}`,
      "-v", `${__dirname}:${__dirname}:ro`, "-w", root];
    for (const name of dockerEnv) args.push("-e", name);
    args.push("--entrypoint", "/bin/sh", "mcr.microsoft.com/powershell:7.5-ubuntu-24.04", path.join(root, "run.sh"));
    const result = spawnSync("docker", args, {
      env, encoding: "utf8", timeout: 240000, maxBuffer: 8 * 1024 * 1024
    });
    const log = name => {
      const file = path.join(root, name);
      return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    };
    assert.equal(result.status, 0,
      `${result.error || ""}\n${result.stdout.slice(-3000)}\n${result.stderr.slice(-3000)}\n${log("configure.log")}\n${log("ctest.log")}`);
    const configured = JSON.parse(fs.readFileSync(path.join(root, "configure.json"), "utf8"));
    for (const expected of [
      "-S", "C:/project source", "-B", "C:/project build",
      "-DNAME=quoted spaces", "-DPREFIX=C:\\Library\\include",
      "-DQUOTED=C:\\Program Files\\SDK", "-DENABLE_PGO:BOOL=YES", "-DENABLE_LTO=OFF",
      "-DBUILDMASTER_DATADIR=C:/BuildMaster", "-DCMAKE_INSTALL_PREFIX=C:\\Install Dir",
      "-DCMAKE_CXX_FLAGS=/W4 /arch:AVX"
    ]) assert.ok(configured.includes(expected), `Missing argument ${expected}: ${JSON.stringify(configured)}`);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "ctest.json"), "utf8")), [
      "--test-dir", "C:/project build", "--output-on-failure", "-R", "probe test", "-E", "bad pattern"
    ]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "configure.json.env"), "utf8")),
      { CFLAGS: "/nologo /arch:AVX", CXXFLAGS: "/arch:AVX" });
    assert.match(log("configure.log"), /CPU baseline: \/arch:AVX/);
    const explicitCpu = JSON.parse(fs.readFileSync(path.join(root, "explicit-cpu.json"), "utf8"));
    assert.ok(explicitCpu.includes("-DCMAKE_CXX_FLAGS=/W4"), JSON.stringify(explicitCpu));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "explicit-cpu.json.env"), "utf8")),
      { CFLAGS: "/arch:AVX2", CXXFLAGS: "" });
    assert.match(log("explicit-cpu.log"), /::warning::CFLAGS already selects a target CPU/);
    assert.match(log("conflict.log"), /conflicts/);
    assert.match(log("quoting.log"), /Invalid cmake-options/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
