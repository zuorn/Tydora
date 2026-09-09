import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/** 仅在内容真正变化时写入，避免 Windows 上 mtime/autocrlf 造成「有改动但无 diff」的假脏文件。 */
function writeIfChanged(path, next) {
  let prev;
  try {
    prev = readFileSync(path, "utf-8");
  } catch {
    prev = null;
  }
  if (prev === next) {
    return false;
  }
  writeFileSync(path, next);
  return true;
}

// 读取版本号
const version = readFileSync(join(root, "VERSION"), "utf-8").trim();
console.log(`Syncing version: ${version}`);

// 更新 tauri.conf.json（桌面端，2026-09-09 重构后位于 app/tydora-desktop/）
const tauriConfPath = join(root, "app", "tydora-desktop", "tauri.conf.json");
const tauriConf = JSON.parse(readFileSync(tauriConfPath, "utf-8"));
tauriConf.version = version;
if (writeIfChanged(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n")) {
  console.log(`Updated tauri.conf.json`);
} else {
  console.log(`tauri.conf.json already at ${version}`);
}

// 更新 Cargo workspace 根版本：tydora-core / tydora-cli / tydora-desktop 都通过
// version.workspace = true 继承 app/Cargo.toml 的 [workspace.package]，改一处即全仓生效。
const workspaceTomlPath = join(root, "app", "Cargo.toml");
const workspaceToml = readFileSync(workspaceTomlPath, "utf-8");
const wpIdx = workspaceToml.indexOf("[workspace.package]");
if (wpIdx === -1) {
  throw new Error("app/Cargo.toml: [workspace.package] not found");
}
const nextWorkspaceToml =
  workspaceToml.slice(0, wpIdx) +
  workspaceToml
    .slice(wpIdx)
    .replace(/^version\s*=\s*".*"/m, `version = "${version}"`);
if (writeIfChanged(workspaceTomlPath, nextWorkspaceToml)) {
  console.log(`Updated app/Cargo.toml (workspace version)`);
} else {
  console.log(`app/Cargo.toml already at ${version}`);
}

// 更新 package.json
const packageJsonPath = join(root, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
packageJson.version = version;
if (writeIfChanged(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n")) {
  console.log(`Updated package.json`);
} else {
  console.log(`package.json already at ${version}`);
}

// 更新落地页版本号
const landingPath = join(root, "website", "landing", "index.html");
let landingHtml = readFileSync(landingPath, "utf-8");
const nextLanding = landingHtml.replace(
  /v\d+\.\d+\.\d+\s*—\s*跨平台支持/,
  `v${version} — 跨平台支持`
);
if (writeIfChanged(landingPath, nextLanding)) {
  console.log(`Updated landing page`);
} else {
  console.log(`landing page already at ${version}`);
}

// 更新文档关于页版本号（中文）
const aboutPathZh = join(root, "website", "docs_zh", "01-开始使用", "02-关于.md");
let aboutMdZh = readFileSync(aboutPathZh, "utf-8");
const nextAboutZh = aboutMdZh.replace(
  /(\|\s*当前版本\s*\|\s*)\d+\.\d+\.\d+(\s*\|)/,
  `$1${version}$2`
);
if (writeIfChanged(aboutPathZh, nextAboutZh)) {
  console.log(`Updated docs_zh/01-开始使用/02-关于.md`);
} else {
  console.log(`docs_zh about page already at ${version}`);
}

// 更新文档关于页版本号（英文）
const aboutPathEn = join(root, "website", "docs_en", "01-Getting-Started", "02-About.md");
let aboutMdEn = readFileSync(aboutPathEn, "utf-8");
const nextAboutEn = aboutMdEn.replace(
  /(\|\s*Current Version\s*\|\s*)\d+\.\d+\.\d+(\s*\|)/,
  `$1${version}$2`
);
if (writeIfChanged(aboutPathEn, nextAboutEn)) {
  console.log(`Updated docs_en/01-Getting-Started/02-About.md`);
} else {
  console.log(`docs_en about page already at ${version}`);
}

console.log(`All versions synced to ${version}`);
