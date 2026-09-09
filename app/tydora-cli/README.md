# tydora-cli

Tydora CLI — 单原生二进制命令行入口，读取同一份 Tydora Markdown vault。

> **Phase 1 + Phase 2 状态（2026-09-07）**：三个只读子命令（notebooks / list / show）+ 四个写路径子命令（create / edit / write / delete），4 档 Unix 退出码、`--json` 输出、Windows UTF-8 console 切换、trash 回收路径、原子写已跑通。Phase 3 加 search / publish / completion；Phase 4 加 MCP。
>
> **业务逻辑抽离（2026-09-07 下午）**：vault 扫描 / frontmatter 解析 / note id 解析已抽到 [`app/tydora-core/`](../tydora-core/README.md)——CLI 仅保留数据模型、命令编排、退出码语义。

## 设计来源

设计上参考同类 Rust CLI 的范式（**不是抄**，是适配 Tydora 的业务分布）：

| 维度 | 参考实现 | Tydora |
|---|---|---|
| 业务核心位置 | Rust（core crate） | 前端 React/TS（CLI 只覆盖"无 GUI 也能跑"的部分） |
| 工程结构 | 新 Cargo workspace | **`app/` Cargo workspace**（2026-09-09 落地）：`src-tauri/` → `tydora-desktop/`、仓库根 `src/` → `tydora-web/`，与 core/cli 同 workspace |
| 解析库 | clap v4 builder | clap v4 builder（一致） |
| 退出码 | 2/3/5/1（严格） | 2/3/5/1（一致） |
| MCP | 对应 mcp 子命令 + 受限 CLI 语法 | `tydora mcp` 待 Phase 4 |

## 编译与运行

### 前置（仅本机一次性）

`tydora-cli` 是 Rust crate。它的二进制依赖 MSVC 工具链：

- Visual Studio Build Tools（含 C++ workload）：`vswhere.exe` 在
  `C:\Program Files (x86)\Microsoft Visual Studio\Installer\` 下能找到
- MSVC `link.exe` 与 Windows SDK `kernel32.lib` 等需要 `LIB` + `INCLUDE` 环境变量

本仓库已经写好 `.cargo/config.toml` 显式指定 MSVC linker 路径
（见 `app/.cargo/config.toml`），但 `LIB` / `INCLUDE` 用户需手动设置或运行
一次 `vcvars64.bat`：

```bash
# PowerShell 或 Git Bash：
cmd.exe /c "call \"C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat\" >nul && cargo build --release"
```

未来如果想省掉这一步，可在仓库根提供一个 `scripts/dev-env.ps1` 自动
`$env:LIB = ...; $env:INCLUDE = ...`，详见 TODO（Phase 5）。

### Build

```bash
cd app
cargo build --release --bin tydora-cli
```

产物：`D:\code\Tydora\target\release\tydora-cli.exe`（workspace 所有 crate
统一 target 目录，见 `app/.cargo/config.toml`）。

### Run

```bash
# 任意指定一个 vault
target/release/tydora-cli.exe --vault D:\path\to\your\vault notebooks --json
target/release/tydora-cli.exe --vault D:\path\to\your\vault list inbox --json
target/release/tydora-cli.exe --vault D:\path\to\your\vault show inbox/welcome --json
```

或者通过 `TYDORA_VAULT` 环境变量：

```bash
TYDORA_VAULT=D:\path\to\your\vault tydora-cli notebooks
```

### Test

```bash
cd app
cargo test --bin tydora-cli --test cli_smoke
# 期望：27 passed; 0 failed（14 Phase 1 + 13 Phase 2）
# （测试内部用 tempfile 自建 fixture，不需要外部数据）

## 子命令（Phase 1 + Phase 2）

### 只读（Phase 1）

```
tydora notebooks                       # 列出 vault 一级目录 + (root) 散落 .md
tydora list <notebook>                 # 列笔记（title 自动从 frontmatter/H1 提取）
tydora show <id>                       # 读 frontmatter + body（id = 相对 vault 路径）
```

### 写路径（Phase 2）

所有写命令都支持 `--dry-run`，破坏性命令（delete）通过 trash 保留原文件。

```
tydora create <notebook>  (< body)     # 新建笔记：title 来自 frontmatter/H1/stub，slug id 自动分配
tydora edit <id> --old <t> --new <t>  # 精确字符串替换（--old 必须唯一 1 处）
tydora edit <id> --old <t> --new-stdin # --new-stdin：从 stdin 读替换文本
tydora edit <id> --old <t> --new <t> --dry-run   # 预览，不写
tydora write <id> (< body)            # 从 stdin 覆盖整篇
tydora write <id> --dry-run (< body)  # 预览，不写
tydora delete <id>                     # 移到 trash（$TYDORA_HOME/trash/vaults/<hash8>/<id>-<ts>.md）
```

### Phase 3 / 4 占位

```
tydora completion bash|zsh|fish        # [Phase 3] shell 补全脚本
tydora search <query>                  # [Phase 3] 跨 notebook 全文搜索
tydora publish                         # [Phase 3] 复用 src-tauri/run_markdown_publish
tydora mcp                             # [Phase 4] MCP over stdio
```

### 写入规则

- **create**：从 stdin 读 body；title 优先级 = frontmatter.title → 首 H1 → `untitled-yyyymmdd`；
  slug id = slugify(title)，冲突自动加 `-2`/`-3`；自动注入 `created` (RFC3339 UTC) + `tags: []`。
- **edit**：`--old` 在文件里必须恰好出现 1 次，否则 `Usage` 错（exit 2）；`--new` 与
  `--new-stdin` 二选一必填（都不给或都给都报错）。`--dry-run` 不写，仅打印预览。
- **write**：从 stdin 整篇覆盖（frontmatter 一并覆盖），文件空拒绝写。
- **delete**：rename 到 `$TYDORA_HOME/trash/vaults/<hash8>/<flat-id>-<ts>.md`。
  子目录分隔符 `/`/`\` 替换为 `_`，避免 trash 内建多级目录。原子 rename。
- **所有写操作**均为原子 `write tmp + rename`，写失败时目标文件保留旧内容。

## 全局 flag

```
-j, --json           Emit structured JSON on stdout
    --vault <PATH>   Vault root（覆盖 $TYDORA_VAULT 与默认发现）
-h, --help           Print help
-V, --version        Print version
```

## JSON schema 版本化

每个数据 model 顶层都有 `"schema": "tydora.<...>.v<N>"`。当前（4 + 4 = 8 个）：

只读（Phase 1）：

- `tydora.vault.v1`     → VaultOverview
- `tydora.notebook.v1`  → NotebookList
- `tydora.note.v1`      → NoteShow

写路径（Phase 2）：

- `tydora.create.v1`    → Created
- `tydora.edit.v1`      → Edited（含 `dry_run`、`bytes_delta`、`body_preview`）
- `tydora.write.v1`     → Wrote（含 `dry_run`、`size`）
- `tydora.delete.v1`    → Deleted（含 `original_path`、`trash_path`）

未来 schema 改动不兼容时升 v（N+1），并保留 v N 至少一个 phase 让消费者迁移。

## 4 档退出码

| code | 含义 | 触发场景 |
|---|---|---|
| 0 | 成功 | 命令完成 |
| 1 | 未分类错误 | 内部错误（暂未使用）|
| 2 | Usage 错误 | 缺参、参数非法、未识别 subcommand、`--old` 不唯一 / `edit` 缺 --new |
| 3 | NotFound | vault / notebook / id 不存在 |
| 5 | IO 错误 | 文件读写失败（含 trash 失败） |

> 未来若需要：4=permission、6=corrupt data ……

## 跨平台

- **Windows**：CLI 启动时切 console codepage 到 UTF-8（65001），无 `windows_subsystem = "windows"` 属性。
- **macOS / Linux**：默认 UTF-8，无需切换。

## 与 Tydora GUI 的语义对齐

- vault 扫描跳过 `.` 隐藏目录/文件（对齐 `src/services/vault-file-scanner.ts:58`）
- title 提取顺序对齐 `src/graph/LocalGraph.tsx:24-?`：frontmatter.title → 首 H1 → file stem
- frontmatter YAML 解析对齐 `src/Editor/frontmatter.ts::parseFrontmatter` 的子集
  （key: value 标量键值对 + 引号剥除；列表/嵌套/锚点等复杂 YAML 待 Phase 3 升级到完整 `serde_yaml`）

## 已知边界

1. **CLI 不感知 GUI 状态**：CLI 写文件（Phase 2+）时 GUI 端需 fs watcher 通知 reload。
   不会冲突但 GUI 端不感知 CLI 写入原因（除非前端区分"我们自己写的"vs"CLI 写的"）。
2. **PowerShell 5.1 管道 ASCII 损坏**：见 `src/main.rs` 的注释，调用方需提前
   `chcp 65001 > $null` 或 `Out-File -Encoding utf8`。
3. **架构阶段（2026-09-09）**：`src-tauri/` 已并入 `app/tydora-desktop/`。CLI
   仍**不**直接以 path 依赖 `tydora_lib`（避免引入 Tauri 全家桶）；共享业务在
   `app/tydora-core/`（Phase 5 抽离，本 README 顶部 blockquote）。
4. **slug 大小写保留**：slugify 保留 ASCII 大写与中文（CJK），导致 Windows / macOS
   默认大小写不敏感文件系统下"Hello" 与 "hello" 命中同一文件。Phase 3 可以再
   统一大小写化，但不强制。
5. **trash 不分 vault**：当前 trash 仅按 vault-hash8 二级目录区分；Phase 3 清理
   策略（GUI 启动时删除 trash >30 天的文件）待实现。
