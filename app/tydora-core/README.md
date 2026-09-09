# tydora-core

Pure-logic crate shared by `tydora-cli` (and — when wired — future `tydora-desktop`).

> **Scope (2026-09-07)**: 业务逻辑去重的种子层。当前包含 vault 扫描
> （与 `src/services/vault-file-scanner.ts` 对齐）、frontmatter 解析
> （与 `src/Editor/frontmatter.ts` 对齐）、note id/title/slug 解析。

## Why this crate exists

Tydora 是一个 Tauri v2 桌面 + 前端应用。在 tydora-core 之前，
"vault 扫描 / frontmatter 解析"逻辑实际散落在三处：

1. 前端 TypeScript：`src/services/vault-file-scanner.ts` + `src/Editor/frontmatter.ts`
2. CLI Rust（Phase 1）：`app/tydora-cli/src/store.rs` 的简化版重写（split_frontmatter / parse_simple_yaml / slugify_filename 等）
3. （并未存在）src-tauri 的 Rust：调研后确认 src-tauri 几乎没有可下沉纯业务

要"业务逻辑只写一份"，正确做法是把 CLI 的 Rust 重写抽到独立 crate —— 这就是 tydora-core。

## 设计约束

1. **依赖严格**：仅 `std` + `serde` + `serde_json` + `thiserror`。  
   不引入 `serde_yaml`（用户决策保持简化 YAML 子集，详见 crate docs）。
2. **不感知 exit code / 退出码**：core 纯粹抛 [`CoreError`]，退出码由调用方
   （CLI 的 [`crate::errors::CliError`] / Tauri IPC 的 `Result<_, String>`）
   决定。已通过 `From<CoreError> for CliError` 桥接。
3. **完全独立**：不引入 `tauri` / `tauri-plugin-*`，可独立编译、独立测试。
4. **对齐前端 TS 语义**：
   - `vault::scan_vault` 跳过 `.` 开头目录 / 文件、单目录 IO 错误 swallow、16 个 IMAGE_EXTENSIONS 列表与 `vault-file-scanner.ts` 逐字一致
   - `frontmatter::split` 解析行为对齐 `frontmatter.ts::parseFrontmatter`（`---\n...\n---\n` 围栏 + 简化 YAML 子集）

## 模块

| 模块 | 内容 | 来源 |
|---|---|---|
| [`error`] | `CoreError` thiserror 类型 + `CoreResult<T>` alias | 新建 |
| [`frontmatter`] | `split(md) -> Frontmatter`, `extract_title`, `parse_simple_kv`（私有） | 抽离自 `app/tydora-cli/src/store.rs:438-522` |
| [`note`] | `resolve_note_path`, `resolve_notebook_dir`, `slugify_filename`, `read_note_title_from_file`, `read_note`, `atomic_write` | 抽离自 `app/tydora-cli/src/store.rs:283-306, 569-660` |
| [`vault`] | `scan_vault`, `lower_ext`, `is_markdown_ext`, `is_canvas_ext`, `is_image_ext`, `IMAGE_EXTENSIONS`, `VaultScan`, `ImageFileRef` | 新建（对齐 `vault-file-scanner.ts`）+ 借鉴 CLI 的 `collect_notes` |

## 模块未涵盖

这些未来有可能下沉，但本期不做（YAGNI）：

- `tydora_core::time::now_rfc3339` / `format_unix_seconds_as_rfc3339`：CLI 的 cmd_create 在用，先留在 `app/tydora-cli/src/store.rs`
- `tydora_core::fs::list_dir_with_meta` + `DirEntryWith_meta`：src-tauri 的 `file_commands.rs` 有纯函数种子，但目前 CLI 没用，先不抽
- `tydora_core::path::find_on_path` 等：从 src-tauri `lib.rs:1145-1172` 看是给 GUI 发布/更新用的
- `tydora_core::version::parse_version` / `compare_versions`：src-tauri `lib.rs:1386-1408`，桌面专有

如果将来要把 src-tauri 物理搬到 `app/tydora-desktop/`，可以**反向**用上 src-tauri 的小纯函数补 core（见 `docs/cli-implementation-plan.md` §A.5–10）。

## 测试

```bash
eval "$(bash scripts/cli-env.sh)"
cd app
cargo test -p tydora-core
# 期望：25 passed; 0 failed
```

## 与 src-tauri 的关系

tydora-core **不是**从 src-tauri/ 抽出来的——而是**从 CLI 重写抽出来**的。
参见 `D:\code\Tydora\docs\cli-implementation-plan.md` §"src-tauri/commands/ 详细盘点"
了解为什么 src-tauri 没有可下沉业务。
