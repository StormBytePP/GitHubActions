const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { step } = require("./test-helpers.cjs");

const actions = path.resolve(__dirname, "..");
const buildAction = path.join(__dirname, "action.yml");
const installAction = path.join(actions, "install-cached", "action.yml");
const toolchainAction = path.join(actions, "install-toolchain", "action.yml");
const updateAction = path.join(actions, "update-apt-cached", "action.yml");

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stormbyte-action-test-"));
  const workspace = path.join(root, "workspace");
  const temp = path.join(root, "runner-temp");
  fs.mkdirSync(workspace);
  fs.mkdirSync(temp);
  try {
    return run({ root, workspace, temp });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function execute(script, env, cwd) {
  return spawnSync("bash", ["-euo", "pipefail", "-c", script], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
}

function output(file) {
  const result = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const index = line.indexOf("=");
    if (index >= 0) result[line.slice(0, index)] = line.slice(index + 1);
  }
  return result;
}

function resolveOptions(f, overrides = {}) {
  const env = {
    INPUT_COMPILER: "",
    INPUT_COMPILER_LEGACY: "",
    INPUT_COMPILER_VERSION: "",
    INPUT_COMPILER_VERSION_LEGACY: "",
    INPUT_COMPILER_CACHE_KEY: "",
    INPUT_COMPILER_CACHE_KEY_LEGACY: "",
    INPUT_COMPILER_CACHE_SCOPE: "",
    INPUT_COMPILER_CACHE_SCOPE_LEGACY: "",
    INPUT_BUILDMASTER_CACHE_KEY: "",
    INPUT_BUILDMASTER_CACHE_KEY_LEGACY: "",
    INPUT_CMAKE_OPTIONS: "",
    INPUT_CMAKE_OPTIONS_LEGACY: "",
    INPUT_BUILD_TARGET: "",
    INPUT_BUILD_TARGET_LEGACY: "",
    INPUT_CTEST: "",
    INPUT_CTEST_LEGACY: "false",
    INPUT_INSTALL_PREFIX: "",
    INPUT_INSTALL_PREFIX_LEGACY: "",
    INPUT_MESON: "",
    INPUT_MESON_LEGACY: "true",
    INPUT_CXX_STDLIB: "",
    INPUT_LIBC: "glibc",
    INPUT_PGO: "",
    INPUT_LTO: "",
    INPUT_CPU_BASELINE: "auto",
    INPUT_DEPLOY: "false",
    REF_TYPE: "branch",
    RUNNER_OS: "Linux",
    RUNNER_ARCH: "X64",
    GITHUB_OUTPUT: path.join(f.root, "options-output"),
    ...overrides
  };
  const script = step(buildAction, "Resolve build options", {
    "inputs.docs": "false",
    "inputs.install": "false"
  });
  const result = execute(script, env, f.workspace);
  return { result, values: result.status === 0 ? output(env.GITHUB_OUTPUT) : {} };
}

test("legacy aliases work and explicit canonical values take precedence", () => fixture(f => {
  const { result, values } = resolveOptions(f, {
    INPUT_COMPILER_LEGACY: "clang-libc++",
    INPUT_CTEST: "false",
    INPUT_CTEST_LEGACY: "true"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(values.compiler, "clang");
  assert.equal(values.cxx_stdlib, "libc++");
  assert.equal(values.ctest, "false");

  const legacy = resolveOptions(f, { INPUT_COMPILER: "gcc", INPUT_CTEST_LEGACY: "true" });
  assert.equal(legacy.result.status, 0, legacy.result.stderr);
  assert.equal(legacy.values.ctest, "true");
}));

test("cpu-baseline auto resolves per platform and accepts none or custom flags", () => fixture(f => {
  for (const [os, arch, compiler, expected] of [
    ["Linux", "X64", "gcc", "-march=x86-64-v3"],
    ["Linux", "ARM64", "clang", "-march=armv8.2-a"],
    ["macOS", "ARM64", "clang", "-mcpu=apple-m1"],
    ["Windows", "X64", "msvc", "/arch:AVX"]
  ]) {
    const { result, values } = resolveOptions(f, { INPUT_COMPILER: compiler, RUNNER_OS: os, RUNNER_ARCH: arch });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(values.cpu_flags, expected);
  }
  const musl = resolveOptions(f, { INPUT_COMPILER: "gcc", INPUT_LIBC: "musl", RUNNER_ARCH: "ARM64" });
  assert.equal(musl.values.cpu_flags, "-march=armv8.2-a");
  const empty = resolveOptions(f, { INPUT_COMPILER: "gcc", INPUT_CPU_BASELINE: "" });
  assert.equal(empty.values.cpu_flags, "-march=x86-64-v3");
  const none = resolveOptions(f, { INPUT_COMPILER: "gcc", INPUT_CPU_BASELINE: "none" });
  assert.equal(none.result.status, 0, none.result.stderr);
  assert.equal(none.values.cpu_flags, "");
  const custom = resolveOptions(f, { INPUT_COMPILER: "gcc", INPUT_CPU_BASELINE: " -march=x86-64-v2 -mtune=generic " });
  assert.equal(custom.values.cpu_flags, "-march=x86-64-v2 -mtune=generic");
}));

test("cpu-baseline rejects values without a CPU selector and unknown auto platforms", () => fixture(f => {
  for (const overrides of [
    { INPUT_COMPILER: "gcc", INPUT_CPU_BASELINE: "-O3" },
    { INPUT_COMPILER: "gcc", INPUT_CPU_BASELINE: "-march=x86-64\n-O3" },
    { INPUT_COMPILER: "clang", RUNNER_OS: "macOS", RUNNER_ARCH: "X64" }
  ]) {
    const { result } = resolveOptions(f, overrides);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /::error::/);
  }
}));

test("Clang with libstdc++ remains Clang", () => fixture(f => {
  const { result, values } = resolveOptions(f, {
    INPUT_COMPILER: "clang",
    INPUT_CXX_STDLIB: "libstdc++",
    INPUT_LIBC: "musl"
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(values.compiler, "clang");
  assert.equal(values.compiler_version, "22");
  assert.equal(values.cxx_stdlib, "libstdc++");
}));

test("deploy requirements and unsupported Windows ARM64 fail early", () => fixture(f => {
  for (const overrides of [
    { INPUT_COMPILER: "gcc", INPUT_DEPLOY: "true", REF_TYPE: "tag" },
    { INPUT_COMPILER: "gcc", INPUT_DEPLOY: "true", INPUT_INSTALL_PREFIX: "package" },
    { INPUT_COMPILER: "msvc", RUNNER_OS: "Windows", RUNNER_ARCH: "ARM64" }
  ]) {
    const { result } = resolveOptions(f, overrides);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /::error::/);
  }
}));

test("standalone Windows toolchains reject ARM64 and non-MSVC compilers", () => fixture(f => {
  for (const [compiler, arch] of [["msvc", "ARM64"], ["gcc", "X64"], ["clang", "X64"]]) {
    const script = step(toolchainAction, "Resolve versions and validate toolchain", {
      "inputs.toolchain": compiler, "inputs.version": "", "runner.os": "Windows", "runner.arch": arch
    });
    const result = execute(script, { GITHUB_ENV: path.join(f.root, "toolchain-env") }, f.workspace);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /::error::/);
  }
}));

test("Ubuntu toolchain package resolution provides GCC headers for Clang with libstdc++", () => fixture(f => {
  for (const [compiler, version, packages, gccVersion] of [
    ["gcc", "", "gcc-16 g++-16", "16"],
    ["gcc", "15", "gcc-15 g++-15", "15"],
    ["clang", "", "gcc-16 g++-16", "16"],
    ["clang", "21", "gcc-16 g++-16", "16"],
    ["clang-libc++", "", "", "16"]
  ]) {
    const suffix = `${compiler}-${version || "default"}`;
    const env = {
      GITHUB_ENV: path.join(f.root, `toolchain-env-${suffix}`),
      GITHUB_OUTPUT: path.join(f.root, `toolchain-output-${suffix}`)
    };
    const script = step(toolchainAction, "Resolve versions and validate toolchain", {
      "inputs.toolchain": compiler, "inputs.version": version,
      "runner.os": "Linux", "runner.arch": "X64"
    });
    const result = execute(script, env, f.workspace);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(output(env.GITHUB_OUTPUT).gcc_packages, packages);
    assert.equal(output(env.GITHUB_ENV).GCC_VERSION, gccVersion);
  }
  assert.match(fs.readFileSync(toolchainAction, "utf8"),
    /^\s+\$\{\{ steps\.resolve\.outputs\.gcc_packages \}\}\s*$/m);
}));

test("Ninja's real binary takes precedence over the pip launcher in later steps", () => fixture(f => {
  const tools = path.join(f.root, "tools");
  const ninjaBin = path.join(f.root, "ninja-bin");
  const scripts = path.join(f.root, "python-scripts");
  fs.mkdirSync(tools);
  fs.mkdirSync(ninjaBin);
  fs.mkdirSync(scripts);
  fs.writeFileSync(path.join(tools, "python3"), `#!/bin/sh
case "$*" in
  *"import ninja;"*) printf '%s\\r\\n' "$NINJA_BIN" ;;
  *"import sysconfig;"*) printf '%s\\r\\n' "$PYTHON_SCRIPTS" ;;
  *"import sys;"*) printf '%s\\n' "$0" ;;
  -m\\ pip\\ *) exit 0 ;;
  *) exit 1 ;;
esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(ninjaBin, "ninja"), "#!/bin/sh\necho 1.13.0\n", { mode: 0o755 });
  const env = {
    PATH: `${tools}:${process.env.PATH}`, NINJA_BIN: ninjaBin, PYTHON_SCRIPTS: scripts,
    GITHUB_PATH: path.join(f.root, "github-path")
  };
  const result = execute(step(toolchainAction, "Install Ninja (pip)"), env, f.workspace);
  assert.equal(result.status, 0, result.stderr);
  const runnerPathOrder = fs.readFileSync(env.GITHUB_PATH, "utf8").trim().split("\n").reverse();
  assert.ok(runnerPathOrder.indexOf(ninjaBin) < runnerPathOrder.indexOf(scripts));
}));

function compilerKey(f, overrides = {}) {
  const expressions = {
    "runner.os": "Linux",
    "runner.arch": overrides.arch || "X64",
    "github.job": "build",
    "github.run_id": "200",
    "github.run_attempt": "1"
  };
  const env = {
    COMPILER: "clang",
    COMPILER_VERSION: "22",
    CXX_STDLIB: "libc++",
    LIBC: "glibc",
    BUILD_TYPE: "Release",
    PGO: "false",
    LTO: "false",
    ACTION_PATH: __dirname,
    CACHE_NAMESPACE: "v1",
    CACHE_SCOPE: overrides.scope || "",
    RUNNER_TEMP: f.temp,
    GITHUB_OUTPUT: path.join(f.root, `key-${overrides.label || "default"}`),
    GITHUB_ENV: path.join(f.root, `env-${overrides.label || "default"}`),
    ...overrides.env
  };
  const result = execute(step(buildAction, "Compute compiler cache keys", expressions), env, f.workspace);
  assert.equal(result.status, 0, result.stderr);
  return output(env.GITHUB_OUTPUT);
}

test("cache snapshots cannot restore another scope or architecture", () => fixture(f => {
  const base = compilerKey(f);
  const scoped = compilerKey(f, { scope: "extra", label: "scoped" });
  const arm = compilerKey(f, { arch: "ARM64", label: "arm" });
  const musl = compilerKey(f, { label: "musl", env: { LIBC: "musl" } });
  assert.equal(base.save_key, `${base.cache_key}--200-1`);
  assert.ok(!scoped.save_key.startsWith(`${base.cache_key}--`));
  assert.notEqual(base.cache_key, arm.cache_key);
  assert.notEqual(base.cache_key, musl.cache_key);
  const manifest = fs.readFileSync(buildAction, "utf8");
  assert.match(manifest, /steps\.cachekeys\.outputs\.cache_key \}\}--\n/);
  assert.match(manifest, /steps\.buildmaster\.outputs\.cache_key \}\}--\n/);
}));

test("distinct cache scopes and namespaces do not collide after sanitizing", () => fixture(f => {
  const first = compilerKey(f, { scope: "feature+ssl", label: "plus" });
  const second = compilerKey(f, { scope: "feature-ssl", label: "dash" });
  const third = compilerKey(f, { label: "namespace-plus", env: { CACHE_NAMESPACE: "cache+v1" } });
  const fourth = compilerKey(f, { label: "namespace-dash", env: { CACHE_NAMESPACE: "cache-v1" } });
  assert.notEqual(first.cache_key, second.cache_key);
  assert.notEqual(third.cache_key, fourth.cache_key);
}));

test("BuildMaster removes tmp before restoring downloads", () => fixture(f => {
  const datadir = path.join(f.temp, "buildmaster-datadir");
  fs.mkdirSync(path.join(datadir, "tmp"), { recursive: true });
  fs.mkdirSync(path.join(datadir, "downloads"));
  fs.writeFileSync(path.join(datadir, "tmp", "stale"), "stale");
  fs.writeFileSync(path.join(datadir, "downloads", "keep"), "cached");
  const env = {
    CACHE_NAMESPACE: "v1", COMPILER: "gcc", COMPILER_VERSION: "15",
    CXX_STDLIB: "libstdc++", LIBC: "musl", BUILD_TYPE: "Release",
    PGO: "true", LTO: "true", CACHE_SCOPE: "", JOB_NAME: "build",
    ACTION_PATH: __dirname,
    RUNNER_TEMP: f.temp, GITHUB_OUTPUT: path.join(f.root, "bm-output"),
    GITHUB_ENV: path.join(f.root, "bm-env")
  };
  const expressions = {
    "runner.arch": "X64", "runner.os": "Linux",
    "github.run_id": "200", "github.run_attempt": "1",
    "github.workspace": f.workspace
  };
  const script = step(buildAction, "Prepare BuildMaster data directory", expressions);
  const result = execute(script, env, f.workspace);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(datadir, "tmp")), false);
  assert.equal(fs.readFileSync(path.join(datadir, "downloads", "keep"), "utf8"), "cached");
  assert.equal(output(env.GITHUB_OUTPUT).save_key.endsWith("--200-1"), true);
  const keys = [];
  for (const [index, scope] of ["feature+ssl", "feature-ssl"].entries()) {
    const scoped = { ...env, CACHE_SCOPE: scope, GITHUB_OUTPUT: path.join(f.root, `bm-${index}`) };
    const next = execute(script, scoped, f.workspace);
    assert.equal(next.status, 0, next.stderr);
    keys.push(output(scoped.GITHUB_OUTPUT).cache_key);
  }
  assert.notEqual(keys[0], keys[1]);
}));

function packageRelease(f, runnerOS, arch, libc, stdlib, prefix = "package", tag = "2.2.3") {
  const env = {
    GITHUB_WORKSPACE: f.workspace,
    GITHUB_REPOSITORY: "StormByte-Suite/StormByte",
    GITHUB_REF_NAME: tag,
    GITHUB_ENV: path.join(f.root, "release-env"),
    RUNNER_TEMP: f.temp,
    RUNNER_OS: runnerOS,
    RUNNER_ARCH: arch,
    INSTALL_PREFIX: prefix,
    LIBC: libc,
    CXX_STDLIB: stdlib
  };
  return execute(step(buildAction, "Package release"), env, f.workspace);
}

test("release archives use the agreed names and preserve notices and symlinks", () => fixture(f => {
  const pkg = path.join(f.workspace, "package");
  fs.mkdirSync(path.join(pkg, "lib"), { recursive: true });
  fs.writeFileSync(path.join(pkg, "lib", "libprobe.so.1"), "library");
  fs.symlinkSync("libprobe.so.1", path.join(pkg, "lib", "libprobe.so"));
  fs.writeFileSync(path.join(f.workspace, "LICENSE"), "license text");
  fs.writeFileSync(path.join(f.workspace, "LICENSE.txt"), "license text variant");
  fs.writeFileSync(path.join(f.workspace, "COPYING"), "copying text variant");
  fs.writeFileSync(path.join(f.workspace, "COPYING.extra"), "copying text");
  fs.writeFileSync(path.join(f.workspace, "THIRD-PARTY"), "third-party text");
  fs.writeFileSync(path.join(f.workspace, "THIRD-PARTY.md"), "third-party text variant");

  for (const [platform, arch, libc, stdlib, name] of [
    ["Linux", "X64", "glibc", "libstdc++", "StormByte-2.2.3-linux-amd64-glibc-libstdc++.zip"],
    ["Linux", "X64", "glibc", "libc++", "StormByte-2.2.3-linux-amd64-glibc-libc++.zip"],
    ["Linux", "X64", "musl", "libstdc++", "StormByte-2.2.3-linux-amd64-musl-libstdc++.zip"],
    ["Linux", "X64", "musl", "libc++", "StormByte-2.2.3-linux-amd64-musl-libc++.zip"],
    ["Linux", "ARM64", "glibc", "libstdc++", "StormByte-2.2.3-linux-arm64-glibc-libstdc++.zip"],
    ["Linux", "ARM64", "glibc", "libc++", "StormByte-2.2.3-linux-arm64-glibc-libc++.zip"],
    ["Linux", "ARM64", "musl", "libstdc++", "StormByte-2.2.3-linux-arm64-musl-libstdc++.zip"],
    ["Linux", "ARM64", "musl", "libc++", "StormByte-2.2.3-linux-arm64-musl-libc++.zip"],
    ["macOS", "ARM64", "glibc", "libc++", "StormByte-2.2.3-macos-arm64.zip"],
    ["macOS", "X64", "glibc", "libc++", "StormByte-2.2.3-macos-x64.zip"],
    ["Windows", "X64", "glibc", "", "StormByte-2.2.3-windows-x64.zip"]
  ]) {
    const result = packageRelease(f, platform, arch, libc, stdlib);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(f.temp, name)), true, name);
  }
  const extract = path.join(f.root, "extract");
  fs.mkdirSync(extract);
  const archive = path.join(f.temp, "StormByte-2.2.3-linux-amd64-glibc-libstdc++.zip");
  const result = spawnSync("cmake", ["-E", "tar", "xf", archive], { cwd: extract, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(extract, "LICENSE"), "utf8"), "license text");
  assert.equal(fs.readFileSync(path.join(extract, "LICENSE.txt"), "utf8"), "license text variant");
  assert.equal(fs.readFileSync(path.join(extract, "COPYING"), "utf8"), "copying text variant");
  assert.equal(fs.readFileSync(path.join(extract, "COPYING.extra"), "utf8"), "copying text");
  assert.equal(fs.readFileSync(path.join(extract, "THIRD-PARTY"), "utf8"), "third-party text");
  assert.equal(fs.readFileSync(path.join(extract, "THIRD-PARTY.md"), "utf8"), "third-party text variant");
  assert.equal(fs.lstatSync(path.join(extract, "lib", "libprobe.so")).isSymbolicLink(), true);
}));

test("release packaging rejects a workspace prefix and path-like tag", () => fixture(f => {
  fs.mkdirSync(path.join(f.workspace, "package"));
  const workspace = packageRelease(f, "Linux", "X64", "glibc", "libstdc++", ".");
  assert.notEqual(workspace.status, 0);
  assert.match(workspace.stdout + workspace.stderr, /workspace root/);
  const tag = packageRelease(f, "Linux", "X64", "glibc", "libstdc++", "package", "v/1");
  assert.notEqual(tag.status, 0);
  assert.match(tag.stdout + tag.stderr, /Tag cannot/);
}));

test("release upload requires an existing release and uses the exact tag and asset", () => fixture(f => {
  const bin = path.join(f.root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "gh"), `#!/bin/sh
printf '%s\\n' "$*" >> "$GH_CALLS"
if [ "$2" = view ] && [ "\${FAIL_VIEW:-0}" = 1 ]; then exit 1; fi
`, { mode: 0o755 });
  const asset = path.join(f.temp, "component-1-linux-amd64-glibc-libstdc++.zip");
  fs.writeFileSync(asset, "archive");
  const env = {
    PATH: `${bin}:${process.env.PATH}`, GH_CALLS: path.join(f.root, "gh-calls"),
    GITHUB_REF_NAME: "1.2.3", GITHUB_REPOSITORY: "owner/component", RELEASE_ASSET: asset
  };
  const script = step(buildAction, "Upload to existing GitHub release");
  const result = execute(script, env, f.workspace);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(env.GH_CALLS, "utf8").trim().split("\n"), [
    "release view 1.2.3 --repo owner/component",
    `release upload 1.2.3 ${asset} --repo owner/component --clobber`
  ]);
  fs.writeFileSync(env.GH_CALLS, "");
  const missing = execute(script, { ...env, FAIL_VIEW: "1" }, f.workspace);
  assert.notEqual(missing.status, 0);
  assert.deepEqual(fs.readFileSync(env.GH_CALLS, "utf8").trim().split("\n"), [
    "release view 1.2.3 --repo owner/component"
  ]);
}));

test("Alpine refuses an unmounted installation prefix before starting Docker", () => fixture(f => {
  const bin = path.join(f.root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "docker"), '#!/bin/sh\nprintf invoked > "$DOCKER_CALLED"\n', { mode: 0o755 });
  const env = {
    PATH: `${bin}:${process.env.PATH}`, DOCKER_CALLED: path.join(f.root, "docker-called"),
    HOST_ARCH: "X64", COMPILER: "gcc", COMPILER_VERSION: "15",
    GITHUB_WORKSPACE: f.workspace, RUNNER_TEMP: f.temp,
    SOURCE_DIR: ".", BUILD_DIR: "build", INSTALL_PREFIX: "/usr/local/unsafe",
    INSTALL_ENABLED: "true", DEPLOY: "false", BUILDMASTER_DATADIR: ""
  };
  const result = execute(step(buildAction, "Build in Alpine (musl)"), env, f.workspace);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /install-prefix must be inside/);
  assert.equal(fs.existsSync(env.DOCKER_CALLED), false);
}));

function aptStep(f, file, name, arch, version = "26.04") {
  const release = path.join(f.root, "os-release");
  fs.writeFileSync(release, `ID=ubuntu\nVERSION_ID=${version}\nVERSION_CODENAME=resolute\n`);
  const env = {
    HOME: f.root, LIBC: "glibc", OS_RELEASE_FILE: release,
    GITHUB_OUTPUT: path.join(f.root, `${name.replaceAll(" ", "-")}-${arch}-${version}`),
    GITHUB_ENV: path.join(f.root, "apt-env")
  };
  const expressions = {
    "runner.os": "Linux", "runner.arch": arch, "inputs.cache-key": "apt-lists",
    "inputs.lists-cache-key": "apt-lists", "inputs.rotate-weekly": "true"
  };
  const script = step(file, name, expressions).replace(". /etc/os-release", '. "$OS_RELEASE_FILE"');
  const result = execute(script, env, f.workspace);
  assert.equal(result.status, 0, result.stderr);
  return output(env.GITHUB_OUTPUT);
}

test("APT warmup and installation share a version- and architecture-scoped cache path", () => fixture(f => {
  const x64 = aptStep(f, updateAction, "Resolve cache prefix", "X64");
  const install = aptStep(f, installAction, "Resolve APT lists cache (Linux)", "X64");
  const arm = aptStep(f, updateAction, "Resolve cache prefix", "ARM64");
  const older = aptStep(f, updateAction, "Resolve cache prefix", "X64", "24.04");
  assert.equal(x64.prefix, install.lists_prefix);
  assert.equal(x64.lists_root, install.lists_root);
  assert.ok(install.lists_key.startsWith(`${x64.prefix}-`));
  assert.notEqual(x64.prefix, arm.prefix);
  assert.notEqual(x64.prefix, older.prefix);
  const manifest = fs.readFileSync(installAction, "utf8");
  assert.match(manifest, /path: \$\{\{ steps\.lists\.outputs\.lists_root \}\}/);
}));

test("APT probing selects Ubuntu Ports for ARM64", () => fixture(f => {
  const release = path.join(f.root, "os-release");
  fs.writeFileSync(release, "VERSION_CODENAME=resolute\n");
  const bin = path.join(f.root, "bin");
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "curl"), `#!/bin/sh
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) output="$2"; shift 2 ;;
    https://*) printf '%s\\n' "$1" >> "$URL_LOG"; shift ;;
    *) shift ;;
  esac
done
printf 'fixture' > "$output"
`, { mode: 0o755 });
  const env = {
    PATH: `${bin}:${process.env.PATH}`, OS_RELEASE_FILE: release,
    URL_LOG: path.join(f.root, "urls"), GITHUB_OUTPUT: path.join(f.root, "probe-output")
  };
  const expressions = {
    "inputs.acquire-timeout": "20", "inputs.acquire-retries": "2", "runner.arch": "ARM64"
  };
  const script = step(updateAction, "Probe InRelease", expressions)
    .replace(". /etc/os-release", '. "$OS_RELEASE_FILE"');
  const result = execute(script, env, f.workspace);
  assert.equal(result.status, 0, result.stderr);
  const urls = fs.readFileSync(env.URL_LOG, "utf8").trim().split("\n");
  assert.equal(urls.length, 4);
  assert.ok(urls.every(url => url.startsWith("https://ports.ubuntu.com/ubuntu-ports/")));
}));

function seedAptIndexes(f, file, name, cachedPackage, failCopy = false) {
  const cached = path.join(f.root, "apt-cache");
  const lists = path.join(cached, "lists");
  const system = path.join(f.root, "system-lists");
  const bin = path.join(f.root, "bin");
  fs.mkdirSync(lists, { recursive: true });
  fs.mkdirSync(system);
  fs.mkdirSync(bin);
  const packageName = "archive_ubuntu_binary-amd64_Packages.lz4";
  fs.writeFileSync(path.join(system, packageName), "stale");
  fs.writeFileSync(path.join(lists, "archive_ubuntu_InRelease"), "cached release");
  if (cachedPackage) fs.writeFileSync(path.join(lists, packageName), "cached packages");
  fs.writeFileSync(path.join(bin, "sudo"), '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, "apt-get"), '#!/bin/sh\nprintf called > "$APT_CALLED"\n', { mode: 0o755 });
  if (failCopy) fs.writeFileSync(path.join(bin, "cp"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    GITHUB_OUTPUT: path.join(f.root, "seed-output"),
    GITHUB_ENV: path.join(f.root, "seed-env"),
    APT_CALLED: path.join(f.root, "apt-called"),
    APT_LISTS_FRESH: "0"
  };
  const expressions = {
    "steps.lists.outputs.enabled": "true",
    "steps.lists.outputs.lists_dir": lists,
    "steps.meta.outputs.lists_root": cached,
    "steps.probe.outputs.hash": "hash",
    "steps.probe.outputs.reachable": "true",
    "steps.restore.outputs.cache-hit": "true",
    "inputs.acquire-timeout": "5",
    "inputs.acquire-retries": "0"
  };
  const script = step(file, name, expressions).replaceAll("/var/lib/apt/lists", system);
  const result = execute(script, env, f.workspace);
  if (!failCopy) assert.equal(result.status, 0, result.stderr);
  return {
    status: result.status,
    usedApt: fs.existsSync(env.APT_CALLED),
    contents: fs.readFileSync(path.join(system, packageName), "utf8")
  };
}

for (const [file, name] of [
  [updateAction, "Seed or update APT lists"],
  [installAction, "Seed APT lists or update"]
]) {
  test(`${name} recognizes compressed cached indexes and replaces stale files`, () => fixture(f => {
    const result = seedAptIndexes(f, file, name, true);
    assert.equal(result.usedApt, false);
    assert.equal(result.contents, "cached packages");
  }));
  test(`${name} refreshes when the cache lacks package indexes`, () => fixture(f => {
    const result = seedAptIndexes(f, file, name, false);
    assert.equal(result.usedApt, true);
  }));
  test(`${name} fails when cached indexes cannot be copied`, () => fixture(f => {
    const result = seedAptIndexes(f, file, name, true, true);
    assert.notEqual(result.status, 0);
    assert.equal(result.usedApt, false);
  }));
}
