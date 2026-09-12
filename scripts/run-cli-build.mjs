// build:cli 的跨平台入口：定位真正的 Git Bash 并转发 scripts/cli-build.sh。
//
// 为什么不直接 `bash scripts/cli-build.sh`：
//   Windows 上 PATH 里的 `bash` 可能解析到 C:\Windows\system32\bash.exe
//   （WSL 启动器），会把脚本丢进 WSL / 被 wsl.exe 安全策略拦截。这里显式
//   定位 Git for Windows / WorkBuddy PortableGit 的 bash.exe 再执行。
//   非 Windows 平台直接用 PATH 上的 bash。
//
// 参数原样透传（--debug / --host-only / --all-unix / --all-windows / --all-macos / --all）。

import { spawnSync } from "child_process";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const script = resolve(projectRoot, "scripts", "cli-build.sh");
const args = process.argv.slice(2);

function findGitBash() {
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  // WorkBuddy PortableGit：~/.workbuddy/binaries/PortableGit/versions/*/bin/bash.exe
  try {
    const portableRoot = join(homedir(), ".workbuddy", "binaries", "PortableGit", "versions");
    if (existsSync(portableRoot)) {
      for (const ver of readdirSync(portableRoot)) {
        candidates.push(join(portableRoot, ver, "bin", "bash.exe"));
        candidates.push(join(portableRoot, ver, "usr", "bin", "bash.exe"));
      }
    }
  } catch {
    // ignore
  }
  // PATH 上的 bash.exe，但排除 Windows 目录（system32\bash.exe 是 WSL 启动器）
  for (const dir of (process.env.PATH || "").split(";")) {
    if (!dir || dir.toLowerCase().includes("\\windows\\")) continue;
    candidates.push(join(dir, "bash.exe"));
  }
  return candidates.find((p) => existsSync(p)) || null;
}

let cmd, cmdArgs;
if (process.platform === "win32") {
  const bash = findGitBash();
  if (!bash) {
    console.error("[build:cli] no usable bash.exe found (avoiding system32 WSL bash). Install Git for Windows.");
    process.exit(1);
  }
  cmd = bash;
  cmdArgs = [script, ...args];
} else {
  cmd = "bash";
  cmdArgs = [script, ...args];
}

console.log(`[build:cli] using: ${cmd}`);
const result = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
process.exit(result.status ?? 1);
