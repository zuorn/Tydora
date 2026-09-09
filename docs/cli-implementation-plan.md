# CLI 与 MCP 实施方案（参考既有 Rust CLI 范式）

> **范围**：先实现 CLI，紧接着实现 MCP。两阶段目标对齐"统一二进制 + 受限 CLI 语法 MCP"范式。本文档给出 Tydora 的具体适配方案与关键决策点。
>
> **状态**：✅ 决策已定（v0.2，2026-09-07） — 工程结构=候选 X、范围=保守、面向=AI Agent
>
> **执行进度**：候选 X 结构已于 2026-09-09 落地——原 `src-tauri/` → `app/tydora-desktop/`、
> 仓库根 `src/` → `app/tydora-web/src/`，与 `tydora-core` / `tydora-cli` 共处一个 Cargo
> workspace（`vite.config.ts` root = `app/tydora-web`，产物 → 仓库根 `.build/web-dist`）。
> 正文中决策时点之前的 `src-tauri/` / `src/` 字样指搬迁前布局，请以 `app/` 下实际路径为准。
>
> **已拍板的关键决策**：
>
> - 工程结构 → **候选 X**：新建 `app/` Cargo workspace，一次到位
> - 第一版范围 → **保守**：Phase 1（只读） + Phase 2（写路径），search/publish/completion 进 Phase 3
> - 面向对象 → **AI Agent**：默认 `--json` 友好、stdin body、`--old` 唯一匹配、`--dry-run` 预览

---

## 0. 一句话结论

**采用 Rust CLI + Tauri sidecar 单二进制方案**：在 `app/` 下新增 Cargo 成员 `tydora-cli` crate（与未来 `app/` Cargo workspace 一并搭建），产出单原生二进制 `tydora-cli`。CLI 直接复用现有 `src-tauri/src/commands/` 下的 Rust 业务命令（文件、监听、发布、终端命令等），不启动 GUI、不打开 WebView、不依赖前端。后续 `tydora mcp` 子命令用同一二进制内的"MCP over stdio"协议层驱动，唯一工具 `tydora_note` 的输入是受限 CLI 子集语法（白名单），自动复用 CLI 命令实现。

> 为什么不是 Node CLI：① Node 需要运行时，分发不如单二进制干净；② `src/export/` 强依赖 DOM/Tauri 插件，Node CLI 复用成本极高；③ 与既有 Rust CLI 范式统一，团队后续认知门槛低。



---

## 1. 参考范式摘要（参照系）

参考实现的 CLI 核心特征：

| 维度      | 参考实现                                                                                       |
| ------- | -------------------------------------------------------------------------------------------- |
| 实现语言    | Rust（独立 CLI crate，与桌面端 crate 平级）                                            |
| 业务复用    | 与 GUI 共享一个 core crate（memo_file、MemoService）                                          |
| 打包      | 单原生二进制，作为 Tauri `externalBin` sidecar 随桌面端分发                                                 |
| 解析库     | clap v4（builder 风格）+ clap_complete                                                           |
| 子命令     | `notebooks / list / show / create / delete / edit / write / search / completion / mcp`（10 个） |
| 错误码     | 严格 Unix 退出码（2 用法 / 3 找不到 / 5 IO / 1 其他）                                                      |
| 跨平台     | Windows UTF-8 console 切换、剥 BOM、PATH 软链幂等                                                     |
| MCP 设计  | 唯一工具（命名随项目而定），输入是"受限 CLI 语法"，禁 shell 元字符                                                |
| 面向对象    | 主为 AI Agent（Codex、Claude Code、OpenCode）                                                      |
| 关键工程化细节 | `--json` 全局 flag、`--dry-run` 预览、stdin body、精确字符串替换                                           |

参考资料：外部参考项目的路径已不在本仓库登记，设计要点见上表。

---


## 2. 参考实现 vs Tydora 的关键差异（决定了"不能 1:1 抄"）

| 维度       | 参考实现                                   | Tydora                                                                                            | 影响                                                                                                |
| -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 业务核心位置   | Rust（core crate）                | **前端 React/TS**（TipTap doc、WikiLink 索引、Canvas 等）                                                  | CLI 能直接复用的能力 = 仅 Rust 端已有的（文件 IO、监听、publish、终端命令等）。**TipTap 编辑、Canvas、双链索引重建等前端独有功能无法通过纯 CLI 暴露** |
| 工作区      | 双工作区（npm + Cargo）                        | 单仓 npm                                                                                            | 新增 `app/` 子目录和 Cargo workspace 是一次性较大的工程改造                                                        |
| Rust 端组织 | 已分多个 crate（core/sync/desktop/mobile/cli） | 单 crate（`src-tauri`）                                                                              | 需要适度拆分或在 `src-tauri/` 内做模块化，不一上来就拆 crate                                                          |
| 发布功能     | 没有 `run_markdown_publish` 这种外部 CLI 调用    | **已有** `run_markdown_publish`（Rust 调外部 `markdown-publish`）+ `src/publish/PublishService.ts`（前端封装） | CLI 第一版就能直接暴露 `publish`，零成本                                                                       |
| 状态中心     | Rust `MemoService`                       | 前端 `App.tsx` useState + localStorage                                                              | CLI 不读写 React state，只能读写**文件系统上**的真实文件（这恰好是更"纯"的接口）                                               |
| 版本管理     | 参考实现自己的方案                             | `VERSION` 文件 + `sync-version.mjs`（含 `tauri.conf.json` `version`）                                  | CLI 二进制的版本字符串也从此单一来源同步                                                                            |

**结论**：Tydora 的 CLI 比参考实现 "天然更纯"——CLI 读写的是磁盘上的 Markdown 文件，与 GUI 的 TipTap 编辑是平行的两条写入路径。冲突解决策略要在实施时定（推荐：CLI 不感知 GUI 状态；GUI 启动时检测文件变更后 reload，与现在的 watcher 协作）。

---

## 3. 三条候选路径对比

| 维度             | 路径 A：Rust sidecar（**推荐**）                | 路径 B：Node CLI + npx tauri 子进程      | 路径 C：Node CLI + npm bin                          |
| -------------- | ---------------------------------------- | ---------------------------------- | ------------------------------------------------ |
| 实现语言           | Rust                                     | Node + spawn Rust                  | Node 纯脚本                                         |
| 分发形态           | 单二进制 sidecar                             | 用户需安装 Node + Tauri CLI             | 用户需 Node + 项目 deps                               |
| 业务复用           | 直接复用 `commands/` Rust 模块                 | 通过子进程桥接，可复用 Rust 命令但延迟/序列化成本高      | 仅复用 `src/utils/` 薄工具；`src/export/` 等强依赖 DOM 不能复用 |
| MCP 衔接         | **同一二进制**内置 MCP stdio 层                  | 需要额外 MCP 服务二进制或子进程协议               | 几乎要重新实现 MCP 协议                                   |
| 工程改造           | 中（新增 Cargo workspace + crate）            | 小（新增 `bin/tydora.mjs` + 一些 IPC 胶水） | 小（同 B）                                           |
| 跨平台一致性         | 高（`install -m 0755`、UTF-8 console、剥 BOM） | 依赖 Node + 用户 PATH                  | 依赖 Node                                          |
| 与参考范式一致性 | **完全一致**，未来维护/借鉴顺畅                       | 偏离                                 | 偏离                                               |
| 主要风险           | 一次性较大；需拆分 `src-tauri/` 或新建 `app/` 结构     | spawn 边界引入额外复杂度；MCP 难以优雅           | CLI 能力天花板低（无法做 publish 等 Rust 命令）                |

**推荐路径 A**。理由：① 与参考范式一致，便于对照实现；② 复用现有 Rust commands，几乎零业务改造成本；③ MCP 直接受益——同一二进制复用 CLI 内核；④ 分发形态干净。

---

## 4. 推荐方案详细设计（路径 A）


### 4.1 目录与工程结构（两套候选，下文 §6 用决策表让你选）

**候选 X**（推荐，迁移成本一次到位）：

```
D:\code\Tydora\
├── package.json
├── src/                     # 前端（不变）
├── src-tauri/               # 现有 Tauri 应用 crate（不动主体）
│   └── src/
│       ├── commands/        # 已有：file/watcher/terminal/proxy/font 等
│       └── ...
├── app/                     # ★ 新建：Cargo workspace 根
│   ├── Cargo.toml
│   ├── .cargo/config.toml
│   ├── tydora-core/         # ★ 新建：从 src-tauri/src/commands/ 抽出的"纯逻辑"层（无 GUI 依赖）
│   │   └── src/
│   │       ├── vault.rs     # vault 扫描（封装 vault-file-scanner 的 Rust 等价物或 rust 重写）
│   │       ├── note_io.rs   # 笔记读写（frontmatter + body）
│   │       ├── publish.rs   # 调用 @abstractwebunit/markdown-publish
│   │       ├── watch.rs     # 文件监听
│   │       └── error.rs     # 统一错误类型 + 退出码映射
│   ├── tydora-desktop/      # ★ 新建：原 src-tauri/ 整个搬过来（仅路径改名）
│   └── tydora-cli/          # ★ 新建：CLI crate
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs
│           ├── lib.rs       # run_cli()
│           ├── cli.rs       # 命令定义 + 解析
│           ├── dispatch.rs
│           ├── store.rs     # 实现各子命令
│           ├── mcp.rs       # MCP over stdio
│           ├── errors.rs
│           ├── paths.rs     # $TYDORA_HOME、$TYDORA_DATA 解析
│           ├── output.rs    # JSON shape
│           ├── fmt.rs       # 人类可读 + CJK 宽度
│           └── tests/
```

**候选 Y**（最小改动，先不拆 crate）：

```
D:\code\Tydora\
├── package.json
├── src-tauri/               # 现有（不动目录结构）
│   ├── Cargo.toml           # 改为 [lib] + [[bin]] tydora-cli
│   └── src/
│       ├── lib.rs           # 现有 Tauri 入口（也导出 tauri::generate_handler!）
│       ├── main.rs          # Tauri 桌面端入口
│       ├── cli/             # ★ 新建 CLI 模块（与 commands/ 平级）
│       │   ├── mod.rs       # run_cli()
│       │   ├── cli.rs
│       │   ├── dispatch.rs
│       │   ├── store.rs
│       │   ├── mcp.rs
│       │   ├── errors.rs
│       │   ├── paths.rs
│       │   ├── output.rs
│       │   └── fmt.rs
│       └── commands/        # 已有
```

候选 Y 的代价是 CLI 与 commands/ 物理上混合；好处是**零目录改动**，第一次跑通最快。  
候选 X 的代价是搬运 + 改路径 + 拆分；好处是**长期清晰**，与参考实现一致。


### 4.2 子命令范围（CLI 第一版）

| 子命令                  | 别名        | 对应参考实现                                    | 实现路径                                                      | 优先级 |
| -------------------- | --------- | -------------------------------------------- | --------------------------------------------------------- | --- |
| `notebooks`          | `nb`      | `notebooks`                                  | 调 Tauri `vault-file-scanner` 等价 Rust 逻辑（需新写或搬运前端 fs 扫描）   | P0  |
| `list <notebook>`    | `ls`      | `list`                                       | 同上                                                        | P0  |
| `show <id>`          | `s`       | `show`                                       | 读 `note.md` + 解析 frontmatter                              | P0  |
| `create <notebook>`  | `new`/`c` | `create`                                     | 从 stdin 读 body，写 `note.md` + 生成 id；title 由首行 `# 标题` 派生    | P0  |
| `delete <id>`        | `rm`      | `delete`                                     | 物理删除（先备份到 trash，由 GUI 启发或简化）                              | P0  |
| `edit <id>`          | `e`       | `edit`                                       | `--old` `--new` `--new-stdin` `--dry-run`，精确字符串替换         | P0  |
| `write <id>`         | `w`       | `write`                                      | 从 stdin 覆盖整篇（`edit` 的非交互等价物）                              | P0  |
| `search <query>`     | `q`       | `search`                                     | 跨 notebook 全文 grep；Rust 端可调 `ripgrep` 子进程或内嵌 `grep` crate | P1  |
| `completion <shell>` | —         | `completion`                                 | bash/zsh/fish 补全脚本                                        | P1  |
| `publish`            | —         | （参考实现没有，Tydora 独有）                        | 复用 `run_markdown_publish`                                 | P1  |
| `agent <sub>`        | —         | （参考实现没有，Tydora 独有）                        | 预留——基于 `agent_engine/`                                    | P2  |
| `mcp`                | —         | `mcp`                                        | MCP over stdio                                            | P2  |
| 全局 flag              | —         | `--json` `-j`、`--version` `-V`、`--help` `-h` |                                                           | —   |

**P0 是先跑通**，P1 加分，P2 是 MCP 阶段的事。

### 4.3 关键工程化设计

1. **clap v4（builder 风格）+ clap_complete**
2. **4 档退出码**（`errors.rs`）：`Usage=2` `NotFound=3` `Io=5` `Other=1`
3. **`--json` 全局 flag**：与 MCP 输出共用一份 JSON schema
4. **stdin 输入**：所有 body 写入都从 stdin 读，不调用 `$EDITOR`
5. **`--old` 唯一匹配**：精确字符串替换；若不唯一强制报错
6. **`--dry-run`**：所有破坏性操作支持预览
7. **Windows UTF-8 console**：启动时 `SetConsoleCP(65001) / SetConsoleOutputCP(65001)`，剥 UTF-8 BOM
8. **路径与跨平台 PATH 安装**（后置到 P1，先只跑 CLI）：桌面端首次启动时把 sidecar 软链/拷贝到 `PATH`，幂等

### 4.4 MCP 衔接预演（保证 CLI 阶段就为它铺路）

> 这部分现在不改代码，只在 CLI 设计上约束。

- CLI 子命令设计时，**所有 read 类子命令都支持 `--json`**，且输出 schema 是稳定版本化的（`{"ok":true,"schema":"note.v1","data":{...}}` 风格）
- `mcp` 子命令独立进程，跑 MCP over stdio 协议；同一二进制复用 `dispatch` 层
- MCP 暴露**唯一工具** `tydora_note`，接收"受限 CLI 子集语法"作为参数：`{"syntax": "list <notebook> --json"}`
- 白名单解析：仅允许已知子命令名 + 双引号字符串字面量 + 数字 + `--flag`；**禁止** `| ; && > < \` $ ( {`等 shell 元字符（用`shell-words\` 解析）
- 不 spawn shell；不引入新依赖
- MCP 详细设计放在 `docs/mcp-implementation-plan.md`（CLI 阶段完成后另写）

### 4.5 构建与分发

- **`scripts/build-cli.sh`**（新）：调用 `cargo build --bin tydora-cli --target <triple> --release`，复制到 `src-tauri/binaries/tydora-cli-<host>`（或候选 X 下的 `app/tydora-desktop/binaries/`）
- **`src-tauri/tauri.conf.json`** 的 `externalBin` 加 `"binaries/tydora-cli"`
- **dev 模式**：`scripts/build-cli.sh --debug` 跑单 host，`cargo tauri dev` 找得到 sidecar
- **Windows**：`.exe` 后缀、PE 签名脚本（参照同类签名脚本）
- **macOS**：去 quarantine xattr
- **Linux**：`install -m 0755`

### 4.6 与现有流程的衔接

- **`VERSION` 文件 + `sync-version.mjs`**：扩展为同步 `app/tydora-cli/Cargo.toml` 的 `version` 字段
- **`package.json` scripts**：新增 `"cli:build": "bash scripts/build-cli.sh"`、`"cli:dev": "cargo run --bin tydora-cli --"`、`"cli:test": "cargo test -p tydora-cli"`
- **`CLAUDE.md`**：新增"CLI 开发"小节，引用本文件
- **CI**：若用户后续接 CI，参考三平台 release 模式的构建脚本

### 4.7 测试策略

- `tests/cli_smoke.rs`：常用子命令冒烟 + 退出码断言
- `tests/cli_args.rs`：clap 解析覆盖
- `tests/mcp_e2e.rs`：MCP 协议握手 + 单 round-trip
- 不引入新的集成测试基础设施

---

## 5. 实施阶段（先 CLI 再 MCP）

### Phase 1 —— CLI 地基（1 个迭代 / ~1 周）

目标：能在终端跑 `tydora notebooks` / `tydora show <id>`，并通过 `--json` 输出。

1. 选定工程结构（候选 X 或 Y，见 §6）
2. 新建 `tydora-cli` crate（或 `cli/` 模块），接入 clap、写最简的 `--version` / `--help`
3. 从 `src-tauri/src/commands/` 抽出"无 GUI 依赖"的部分到 `tydora-core`（按需）：
   - 第一阶段可以**不抽**，直接让 `cli/` 调用 `commands/` 模块（候选 Y 路径），先跑通业务
4. 把 `vault-file-scanner.ts` 中的扫描逻辑用 Rust 重写（或作为子进程调 Node 都行——为了避免引入 cppgc 依赖，先重写更稳）
5. 实现 `notebooks` / `list` / `show` 三个只读子命令 + `--json`
6. 加 4 档退出码 + Windows UTF-8 console
7. 冒烟测试

### Phase 2 —— CLI 写路径（1 个迭代 / ~1 周）

1. 实现 `create`（stdin body + id 生成）
2. 实现 `edit`（`--old` `--new` `--new-stdin` `--dry-run`，强制唯一匹配）
3. 实现 `write`（stdin 覆盖）
4. 实现 `delete`（先软删除到 `$TYDORA_HOME/trash/`，桌面端启动时清理）
5. JSON schema 文档化（v1 锁定）

### Phase 3 —— CLI 进阶（1 个迭代）

1. `search`（ripgrep 子进程或内嵌 `grep` crate）
2. `publish`（复用 `run_markdown_publish`）
3. `completion <shell>`（clap_complete）
4. 构建脚本（`scripts/build-cli.sh`）+ Tauri `externalBin` 接入
5. 桌面端首次启动时 PATH 安装（`cli_link.rs` 移植）

### Phase 4 —— MCP（实施时另出方案，约束已在本文件 §4.4 预设）

- CLI 三阶段完成后，基于"CLI 内核 + stdio 协议层"，暴露 `tydora mcp`
- 唯一工具 `tydora_note`，受限 CLI 子集语法
- 对接 Codex / Claude Code / OpenCode 的 MCP 客户端配置示例

---

## 6. 关键决策点（✅ 已拍板）

| # | 决策                | 结论                                                                                                                             |
| - | ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1 | 工程结构              | ✅ **候选 X**：新建 `app/` Cargo workspace，把 `src-tauri/` 整体搬过来作为 `tydora-desktop/`；新增 `tydora-core/`（抽离无 GUI 依赖的纯逻辑）和 `tydora-cli/` |
| 2 | CLI 第一版范围         | ✅ **保守**：Phase 1（只读地基：notebooks/list/show + --json + 4 档退出码 + Windows UTF-8）+ Phase 2（写路径：create/edit/write/delete + dry-run）  |
| 3 | `src-tauri/` 路径调整 | ✅ **一次性搬**：与候选 X 同步启用                                                                                                          |
| 4 | CLI 面向对象          | ✅ **AI Agent**：默认 `--json`、stdin body、`--old` 唯一匹配、`--dry-run` 预览；不做交互式 prompt                                      |

---

## 7. 风险与待澄清问题

1. **CLI 写入与 GUI 的并发冲突**：CLI 写文件时 GUI 正在 TipTap 里编辑同文件，需要 fs watcher 通知 GUI reload。已有 `watcher_commands.rs`，但要确认能识别"CLI 写入"vs"GUI 写入"以避免回声循环（参考把写文件统一收敛到一个入口的做法）。
2. **`run_markdown_publish` 当前依赖外部 `markdown-publish` npm 包**：CLI 中需要从 Cargo 调用，需确认 npm 包有可执行入口且支持参数化。
3. **Vault 扫描逻辑迁移**：`src/services/vault-file-scanner.ts` 是 TS 实现，CLI 用 Rust 重写会引入功能/性能差异，建议先用 Rust 重写最简版本，对照 TS 版本交叉验证。
4. **Windows 代码签名证书**：参考同类签名脚本，若需要签名需用户提供证书。
5. **`VERSION` 同步扩展**：用户是否同意把 `app/tydora-cli/Cargo.toml` 的 `version` 也加进 `sync-version.mjs`？
6. **CLI 写文件的 `id` 策略**：Tydora 的笔记 id 是 GUID 还是路径 hash？需到 `src/services/index-builder.ts` 或类似地方确认，否则 `create` 命令的 id 生成可能与 GUI 不一致。

---

## 8. 参考资料

- `D:\code\Tydora\CLAUDE.md`（Tydora 项目速查）
- `D:\code\Tydora\docs\export-feature-plan.md`（命名风格与文档结构参考）
- `D:\code\Tydora\src-tauri\src\commands\`（Rust 端已有业务能力）
- `D:\code\Tydora\src\services\vault-file-scanner.ts`（Vault 扫描的 TS 实现，需迁移）
- `D:\code\Tydora\src\publish\PublishService.ts`（发布功能的 TS 封装，对应 Rust `run_markdown_publish`）
