//! `tydora publish` —— 调用 markdown-publish CLI 把 vault 构建成静态网站。
//!
//! 设计参考：docs/cli-implementation-plan.md（Phase 3）+
//! `app/tydora-desktop/src/lib.rs::run_markdown_publish`（同一外部 CLI 的
//! GUI 调用方，launcher 查找 / Node 24 wrapper 逻辑与其语义对齐）。
//!
//! ## launcher 三级查找（与桌面端一致）
//!
//! 1. 开发环境：沿 cwd 祖先链找 `package.json`（仓库根标记）→
//!    `vendor/markdown-publish/tools/cli/cli.mjs`，其次 node_modules
//! 2. 全局 npm 安装：PATH 上的 `markdown-publish`[.cmd/.exe]，
//!    并尽量反解出真实 `cli.mjs`（`node <cli.mjs>` 启动可绕过
//!    Node 24 Windows realpathSync EISDIR）
//! 3. 都找不到 → NotFound（exit 3），给出 `npm install -g` 安装指引
//!
//! 生产环境（安装包）不随包分发 markdown-publish（node_modules 82MB，
//! 见打包体积约定），依赖用户全局安装。

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::errors::{CliError, CliResult};
use crate::paths;

const PKG_SUB: &str = "tools/cli/cli.mjs";

#[derive(Debug, Clone, Default)]
pub struct PublishOptions {
    pub out: Option<PathBuf>,
    pub site_name: Option<String>,
    pub site_lang: Option<String>,
    pub site_url: Option<String>,
    pub base_href: Option<String>,
    pub build_mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Published {
    pub schema: &'static str,
    pub vault: PathBuf,
    pub out_dir: PathBuf,
    /// 实际启动方式（诊断用），如 `node D:\...\cli.mjs`
    pub launcher: String,
    pub success: bool,
    pub exit_code: Option<i32>,
    /// 子进程 stdout 尾部（超长截断，保尾不保头——错误信息通常在尾部）
    pub stdout: String,
    pub stderr: String,
}

const INSTALL_HINT: &str = "markdown-publish CLI not found.\n\n\
Publishing requires the markdown-publish CLI. Install Node.js (https://nodejs.org) first, then run:\n\n\
    npm install -g @abstractwebunit/markdown-publish\n\n\
Then retry `tydora publish`.";

/// `tydora publish [--out DIR] [--site-name ...] ...`
pub fn cmd_publish(opts: &PublishOptions, explicit: Option<&Path>) -> CliResult<Published> {
    let vault = paths::resolve_vault(explicit)?;
    if !vault.is_dir() {
        return Err(CliError::NotFound(format!(
            "vault directory '{}' does not exist",
            vault.display()
        )));
    }
    let out_dir = match &opts.out {
        Some(p) => p.clone(),
        None => default_out_dir(&vault),
    };

    let Some(launch) = find_launcher() else {
        return Err(CliError::NotFound(INSTALL_HINT.to_string()));
    };

    let mut args: Vec<String> = vec![
        "build".into(),
        "--vault".into(),
        vault.to_string_lossy().into_owned(),
        "--out".into(),
        out_dir.to_string_lossy().into_owned(),
    ];
    if let Some(v) = &opts.site_name {
        args.extend(["--site-name".into(), v.clone()]);
    }
    if let Some(v) = &opts.site_lang {
        args.extend(["--site-lang".into(), v.clone()]);
    }
    if let Some(v) = &opts.site_url {
        if !v.is_empty() {
            args.extend(["--site-url".into(), v.clone()]);
        }
    }
    if let Some(v) = &opts.base_href {
        args.extend(["--base-href".into(), v.clone()]);
    }
    if let Some(v) = &opts.build_mode {
        args.extend(["--build-mode".into(), v.clone()]);
    }

    // Node.js v24 的 realpathSync 在 Windows 上对 D: 等驱动器根 lstat 报 EISDIR。
    // 与桌面端一致：当 launcher 是 `node <cli.mjs>` 时，生成一个临时 wrapper
    // 脚本（dynamic import 真实模块），绕过主入口的 realpathSync。
    let cli_mjs = launch.args.first().map(PathBuf::from);
    let (program, final_args) = if launch.program == "node" && is_cli_mjs(cli_mjs.as_deref()) {
        let wrapper = write_wrapper(cli_mjs.as_deref().unwrap())?;
        (
            "node".to_string(),
            vec![wrapper.into_os_string()],
        )
    } else {
        (launch.program.clone(), launch.args.clone())
    };
    let launcher_desc = {
        let mut s = program.clone();
        for a in &final_args {
            s.push(' ');
            s.push_str(&a.to_string_lossy());
        }
        s
    };

    let output = Command::new(&program)
        .args(&final_args)
        .args(&args)
        .output()
        .map_err(|e| {
            CliError::Other(format!(
                "failed to launch markdown-publish ({program}); is Node.js installed? {e}"
            ))
        })?;

    Ok(Published {
        schema: "tydora.publish.v1",
        vault,
        out_dir,
        launcher: launcher_desc,
        success: output.status.success(),
        exit_code: output.status.code(),
        stdout: tail(&String::from_utf8_lossy(&output.stdout), 8000),
        stderr: tail(&String::from_utf8_lossy(&output.stderr), 8000),
    })
}

// ============================================================================
// launcher 查找（移植自 tydora-desktop/src/lib.rs，语义对齐）
// ============================================================================

/// 解析出的启动方式：`node <cli.mjs>` 或直接可执行（全局 shim）。
struct Launcher {
    program: String,
    args: Vec<std::ffi::OsString>,
}

fn find_launcher() -> Option<Launcher> {
    // 1. 开发环境：沿 cwd 祖先链找仓库根（package.json）→ vendor → node_modules
    if let Some(project_root) = current_project_root() {
        let vendor = project_root
            .join("vendor")
            .join("markdown-publish")
            .join(PKG_SUB.replace('/', std::path::MAIN_SEPARATOR_STR));
        if vendor.is_file() {
            return Some(Launcher {
                program: "node".into(),
                args: vec![vendor.into_os_string()],
            });
        }
        let local = project_root
            .join("node_modules")
            .join("@abstractwebunit")
            .join("markdown-publish")
            .join(PKG_SUB.replace('/', std::path::MAIN_SEPARATOR_STR));
        if local.is_file() {
            return Some(Launcher {
                program: "node".into(),
                args: vec![local.into_os_string()],
            });
        }
    }

    // 2. 全局 npm 安装（Windows 下通常为 markdown-publish.cmd）
    for name in ["markdown-publish", "markdown-publish.cmd", "markdown-publish.exe"] {
        if let Some(path) = find_on_path(name) {
            // 优先反解真实 cli.mjs：让上层走 `node <cli.mjs>` + wrapper 保护
            if let Some(cli) = global_cli_mjs(&path) {
                return Some(Launcher {
                    program: "node".into(),
                    args: vec![cli.into_os_string()],
                });
            }
            return Some(Launcher {
                program: path.to_string_lossy().into_owned(),
                args: vec![],
            });
        }
    }

    None
}

/// 沿 cwd 祖先链找 `package.json`（仓库根标记）。
fn current_project_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join("package.json").is_file() {
            return Some(dir);
        }
        if !dir.pop() {
            return None;
        }
    }
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        for candidate in candidate_bin_paths(&dir, name) {
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn candidate_bin_paths(dir: &Path, name: &str) -> Vec<PathBuf> {
    let mut out = vec![dir.join(name)];
    if cfg!(windows) {
        out.push(dir.join(format!("{name}.cmd")));
        out.push(dir.join(format!("{name}.exe")));
        out.push(dir.join(format!("{name}.bat")));
    }
    out
}

/// 从 npm 全局 shim 反解真实的 `tools/cli/cli.mjs`。
///
/// Windows：`<prefix>\markdown-publish.cmd` → 包在 `<prefix>\node_modules\<pkg>`
/// POSIX  ：`<prefix>/bin/markdown-publish` → `<prefix>/lib/node_modules/<pkg>`，
///          shim 本身通常就是指向 cli.mjs 的符号链接
fn global_cli_mjs(shim: &Path) -> Option<PathBuf> {
    let pkg_sub = PathBuf::from("node_modules")
        .join("@abstractwebunit")
        .join("markdown-publish")
        .join(PKG_SUB.replace('/', std::path::MAIN_SEPARATOR_STR));

    if let Some(dir) = shim.parent() {
        let candidate = dir.join(&pkg_sub);
        if candidate.is_file() {
            return Some(candidate);
        }
        if let Some(prefix) = dir.parent() {
            let candidate = prefix.join("lib").join(&pkg_sub);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    if let Ok(real) = shim.canonicalize() {
        if real.file_name().and_then(|n| n.to_str()) == Some("cli.mjs") {
            return Some(real);
        }
    }

    None
}

// ============================================================================
// Node 24 EISDIR wrapper（与桌面端 run_markdown_publish 相同的做法）
// ============================================================================

fn is_cli_mjs(p: Option<&Path>) -> bool {
    p.and_then(|p| p.extension().map(|e| e == "mjs"))
        .unwrap_or(false)
}

/// 生成临时 wrapper mjs，通过 dynamic import 加载真实 CLI 模块。
fn write_wrapper(cli: &Path) -> CliResult<PathBuf> {
    let wrapper = format!(
        "import {{ parseFlags, resolveConfig }} from '{}';\n\
         import {{ runBuild }} from '{}';\n\
         const [cmd, ...rest] = process.argv.slice(2);\n\
         if (cmd !== 'build') {{ console.error('Usage: markdown-publish build [...]'); process.exit(1); }}\n\
         const flags = parseFlags(rest);\n\
         const cfg = resolveConfig({{ flags, env: process.env, cwd: process.cwd() }});\n\
         try {{ const out = runBuild(cfg, {{ cwd: process.cwd() }}); console.log(`✓ Site built to ${{out}}`); }}\n\
         catch (err) {{ console.error(`✗ ${{err.message}}`); process.exit(1); }}\n",
        file_url(&cli.with_file_name("resolve-config.mjs")),
        file_url(&cli.with_file_name("run-build.mjs")),
    );
    let path = std::env::temp_dir().join("tydora-mp-launcher.mjs");
    std::fs::write(&path, wrapper)?;
    Ok(path)
}

/// 极简 file:// URL（无 url crate 依赖）。处理 Windows 盘符、`\`、空格等。
fn file_url(p: &Path) -> String {
    let mut s = p.to_string_lossy().replace('\\', "/");
    if !s.starts_with('/') {
        s.insert(0, '/');
    }
    let mut out = String::from("file://");
    for c in s.chars() {
        match c {
            ' ' => out.push_str("%20"),
            '#' => out.push_str("%23"),
            '?' => out.push_str("%3F"),
            '%' => out.push_str("%25"),
            _ => out.push(c),
        }
    }
    out
}

// ============================================================================
// helpers
// ============================================================================

/// 默认输出目录：`<vault>-site`（与 vault 同级）。
fn default_out_dir(vault: &Path) -> PathBuf {
    let name = vault
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "vault".into());
    match vault.parent() {
        Some(parent) => parent.join(format!("{name}-site")),
        None => PathBuf::from(format!("./{name}-site")),
    }
}

/// 保留字符串尾部最多 `max` 字符（构建日志的错误信息在尾部）。
fn tail(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let skipped = s.chars().count() - max;
    format!("…(省略前 {skipped} 字符)…{}", s.chars().skip(skipped).collect::<String>())
}
