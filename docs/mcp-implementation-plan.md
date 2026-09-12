# Tydora MCP 实施方案（`tydora mcp`，Phase 4）

> **状态**：✅ **已实现（2026-09-11 晚，v1.0 方案 → Phase 4a+4b 一次落地）**。
> 实测：68 个测试全过（mcp.rs 单测 9 + cli_smoke 38 + mcp_e2e 21），真实 vault
> NDJSON 协议冒烟通过。
> **与方案的两处实现偏差**（均为简化，不影响契约）：
> ① §5.1-4 的"警告并入结果 warnings 数组"简化为警告继续走 stderr（= 服务器日志）；
> ② §8.2 的 main.rs 无需改动（`ensure_utf8_console` 在无控制台进程上静默失败，无害）。
> **顺手修复的 CLI 既有 bug**：`create` 返回的 `id` 此前是纯 slug，与"id = vault
> 相对路径"约定不一致（create 的 id 喂给 show/edit 会 NotFound），已改为
> `note_id_from_path()` 生成 vault 相对 id。
> **前置**：`docs/cli-implementation-plan.md` §4.4 已预设的 MCP 约束（唯一工具、
> 受限 CLI 子集语法、不 spawn shell、不引入新依赖）全部继承，本文只做细化与落地。
> **前置实现**：CLI Phase 1/2/3 已完成，`search` / `publish` / `completion` 可用，
> JSON schema 稳定（`tydora.<model>.v1`）。

---

## 0. 一句话结论

**在 `tydora-cli` 同一二进制内实现 MCP over stdio 服务器**：`tydora mcp` 子命令
进入协议循环，把 MCP 客户端（Claude Code / Codex / Cursor 等）发来的
`tools/call` 映射为**受限 CLI 子集语法**（唯一工具 `tydora_note`），复用 CLI 的
`cli.rs → dispatch → store/publish` 全链路执行，以版本化 JSON schema 返回。
协议层手写（JSON-RPC 2.0 + serde_json，零新依赖），输出层做一次 sink 化重构
让命令结果可以写进内存缓冲而不是 stdout。

---

## 1. 目标与非目标

### 1.1 目标

| # | 目标 | 验收标准 |
|---|------|----------|
| G1 | 同一二进制提供 MCP 服务 | `tydora mcp` 启动后通过 MCP 客户端完成 handshake |
| G2 | 暴露 vault 全部 CLI 能力 | notebooks / list / show / search（读）+ create / edit / write / delete（写）全部可调 |
| G3 | 面向 AI Agent 的安全边界 | 协议层拒绝 shell 元字符、拒绝 `--vault`（vault 钉死）、写操作有 dry-run / trash 兜底 |
| G4 | 稳定输出契约 | 工具返回 = CLI `--json` 的同一 schema（`tydora.<model>.v1`），MCP 侧零转换 |
| G5 | 零新增依赖 | 协议层只用已有的 `serde_json` + `shell-words` |
| G6 | 与 GUI 并发安全 | MCP 写入触发 GUI watcher reload，无回声循环（复用 CLI Phase 2 已验证的写路径） |

### 1.2 非目标（本版不做）

- ❌ **resources / prompts 能力**：MCP 的 resources（把笔记暴露为资源 URI）与
  prompts 模板推迟到 Phase 4.5（§8.3），首版 `capabilities` 只声明 `tools`
- ❌ **publish**：MCP 场景下 publish 是"分钟级、带副作用的构建"，且要 spawn
  node 子进程，与"单轮问答式工具调用"不匹配 → 默认禁用，`--allow-publish`
  显式开启后才在白名单里（§6.2）
- ❌ **多 vault**：一个 MCP 服务器实例只服务一个 vault（启动时钉死）
- ❌ **流式进度**：`notifications/progress` 首版不实现（所有命令都是亚秒级，
  search 有 limit 兜底）
- ❌ **HTTP / SSE 传输**：只做 stdio（MCP 对本地进程的标准传输）

---

## 2. 总体架构

```
┌─────────────┐   JSON-RPC 2.0 (NDJSON over stdio)   ┌──────────────────────────────┐
│  AI Agent    │ ───────────────────────────────────▶ │  MCP Client（Claude Code 等） │
└─────────────┘                                       └──────────────┬───────────────┘
                                                                      │ spawn
                                                                      ▼
                                                       ┌──────────────────────────────┐
                                                       │  tydora-cli.exe mcp           │
                                                       │  ┌────────────────────────┐  │
                                                       │  │ mcp.rs  协议层          │  │
                                                       │  │  · JSON-RPC 路由        │  │
                                                       │  │  · initialize/listen    │  │
                                                       │  └───────────┬────────────┘  │
                                                       │              │ tools/call    │
                                                       │              ▼               │
                                                       │  ┌────────────────────────┐  │
                                                       │  │ 受限语法解析器           │  │
                                                       │  │  shell-words 分词       │  │
                                                       │  │  白名单 + 元字符拒绝     │  │
                                                       │  └───────────┬────────────┘  │
                                                       │              │ argv          │
                                                       │              ▼               │
                                                       │  ┌────────────────────────┐  │
                                                       │  │ cli.rs → dispatch.rs    │  │  ← 与 CLI
                                                       │  │ store.rs / publish.rs   │  │    完全同一条
                                                       │  │ tydora-core             │  │    执行路径
                                                       │  └───────────┬────────────┘  │
                                                       └──────────────┼───────────────┘
                                                                      │ 文件系统 IO
                                                                      ▼
                                                       ┌──────────────────────────────┐
                                                       │  Vault（磁盘上的 Markdown）    │
                                                       │  （GUI watcher 监听同一目录）  │
                                                       └──────────────────────────────┘
```

**核心设计判断**：MCP 工具调用 = "受控的 CLI 调用"。不新增任何业务实现，
MCP 层只做两件事——**协议翻译**（JSON-RPC ↔ 函数调用）和**语法隔离**
（Agent 的自由文本 → 白名单化的 argv）。所有安全属性（路径穿越拒绝、
原子写、trash 回收、退出码语义）由 CLI 层已有的实现保证，MCP 层不重复发明。

---

## 3. 传输与协议层

### 3.1 stdio 帧格式

MCP stdio 传输 = **换行分隔的 UTF-8 JSON**（不是 LSP 的 Content-Length 头）：

- 每条消息一个 JSON-RPC 对象，**消息内不得有裸换行**（字符串内的 `\n` 是转义序列，合法）
- 读写都走 `stdin` / `stdout` 的原始字节流，逐行 `\n` 分帧
- **stdout 是协议专线**：任何非协议输出（命令结果、日志）写 stdout 都会
  撕裂协议流 → 这是 §5.1 输出 sink 化重构的根因
- `stderr` 自由使用：`env_logger`（默认 warn）与错误诊断照常写 stderr，
  MCP 客户端把它当服务器日志展示，不影响协议

实现要点（mcp.rs）：

```rust
// 读：BufReader::lines()（自带按 \n 分帧）
// 写：serde_json::to_string()（紧凑序列化，天然无裸换行）+ writeln!
//     必须用 to_string 而不是 to_string_pretty —— pretty 会引入裸换行
```

### 3.2 消息大小限制

| 限制 | 值 | 理由 |
|------|-----|------|
| 单条入站消息 | 10 MB | `tools/call` 里最大的合法 payload 是 `stdin`（write 命令的全文），32 MB 太宽，10 MB 覆盖绝大多数笔记 |
| 单条出站消息 | 无硬限（search 已有 `--limit` 与行数截断） | JSON 转义后仍可能膨胀，信任 CLI 层已有的截断 |

超限处理：读到超长行时直接关闭连接前先回一个 JSON-RPC error
（`-32600`，message 说明 size limit），防止 Agent 端把静默断连误判为崩溃。

### 3.3 方法路由表

| 方法 | 方向 | 行为 |
|------|------|------|
| `initialize` | 请求 | 返回 `protocolVersion` + `capabilities: {tools: {listChanged: false}}` + `serverInfo: {name: "tydora", version: CARGO_PKG_VERSION}` |
| `notifications/initialized` | 通知 | 仅记录，不回复 |
| `ping` | 请求 | 返回空 `{}` |
| `tools/list` | 请求 | 返回唯一工具 `tydora_note` 的定义（§4.2） |
| `tools/call` | 请求 | 解析受限语法 → 复用 dispatch → 返回结果（§5） |
| `notifications/cancelled` | 通知 | 首版忽略（所有命令亚秒级，无需取消语义） |
| 其它方法（含 resources/*、prompts/*） | 请求 | JSON-RPC error `-32601 Method not found` |
| JSON-RPC batch（数组消息） | — | 2025-06-18 规范已移除 batch，返回 `-32600` 单条错误 |
| 非法 JSON / 缺 jsonrpc / id | — | `-32700 Parse error` / `-32600 Invalid Request`（id 已知则带 id） |

### 3.4 协议版本协商

`initialize` 请求里客户端带 `protocolVersion`。策略（与 MCP 规范建议一致）：

1. 客户端版本 ∈ 服务器支持集 `{ "2025-03-26", "2025-06-18" }` → **原样回显**
2. 不在支持集 → 回服务器的最新版（`2025-06-18`），客户端自己决定断连或兼容
3. 服务器实现按"两版差异为零"处理（本方案用到的 tools 能力在两版间无差异），
   `initialize` 之外不感知版本

### 3.5 生命周期

```
客户端 spawn tydora mcp
  → initialize 请求/响应（握手）
  → notifications/initialized（客户端通知）
  → [tools/list, tools/call ...] 循环
  → 客户端关闭 stdin（或 kill 进程）
  → 服务器读到 EOF → flush stdout → 退出（exit 0）
```

主循环是**单线程顺序处理**：MCP 工具调用天然是逐请求的，且 CLI 写路径
有"临时文件 + rename"的原子性假设，串行化最安全。不做并发（若未来有
性能诉求再引入请求队列，见 §10 风险 6）。

---

## 4. 工具层设计

### 4.1 为什么是"唯一工具 + 受限语法"（决策复核）

| 维度 | A. 唯一工具 `tydora_note`（✅ 选定） | B. 每个子命令一个工具（9 个工具） | C. 结构化 JSON 参数（每命令一个 inputSchema） |
|------|------|------|------|
| tools/list 噪音 | 1 条 | 9 条（Agent 上下文占用大） | 9 条 |
| 与 CLI 对齐 | **同一条 dispatch 路径，零业务分叉** | 要把每个子命令的参数提取逻辑复制到 schema | 同左，且 schema 与 clap 定义双维护 |
| 演进成本 | CLI 加命令 → MCP 自动获得 | CLI 加命令 → 必须同步加工具定义 | 同左 |
| Agent 出错面 | 语法错误在白名单层被拒绝，返回明确提示 | 参数错误由 JSON schema 校验 | 同 B |
| 已有约束 | **方案 §4.4 已拍板** | 违背 | 违背 |

结论：维持 A。B/C 的"schema 校验"优势用**白名单错误信息**补齐
（§4.4 第 5 步：拒绝时返回"支持的命令 + 用法示例"），Agent 自纠错成本低。

### 4.2 工具定义（tools/list 返回）

```json
{
  "tools": [{
    "name": "tydora_note",
    "description": "Operate on the Tydora vault (list/show/search notes, create/edit/write/delete). Input is a restricted tydora CLI command line; shell metacharacters are rejected.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "syntax": {
          "type": "string",
          "description": "Restricted tydora CLI syntax, e.g. 'search \"Vim 模式\" --limit 5'. Allowed commands: notebooks, list, show, search, create, edit, write, delete."
        },
        "stdin": {
          "type": "string",
          "description": "Optional body for create/write, or replacement text for edit --new-stdin. Replaces CLI stdin."
        }
      },
      "required": ["syntax"]
    }
  }]
}
```

**`stdin` 字段是 CLI 与 MCP 的唯一语义分叉**：CLI 从真实 stdin 读 body
（协议流被占用），MCP 从参数读。实现上把 `store::read_stdin_body()`
参数化为"body 提供者"（§5.1），两种入口各注入一个提供者。

### 4.3 受限语法文法

```
syntax     := command ( WS arg )*
command    := "notebooks" | "list" | "show" | "search"
            | "create" | "edit" | "write" | "delete"
arg        := flag | value
flag       := "--" name | "-" letter            （仅该命令白名单内的 flag）
value      := word | DQUOTED
DQUOTED    := '"' ([^"\] | ESCAPE)* '"'         （shell-words 规则：支持 \" 转义）
```

**词法层**（复用 `shell_words::split`）：

- 正确处理双引号、反斜杠转义、引号内空格（中文标题 / 含空格 id 必需）
- 引号不闭合 → 直接拒绝（`Usage` 错误，不猜测）

**语法层**（mcp.rs 白名单校验，按命令逐一限定）：

| 命令 | 允许的 flag | 禁止项 |
|------|------------|--------|
| `notebooks` | （无） | — |
| `list` | （无） | — |
| `show` | （无） | — |
| `search` | `--notebook/-b` `--limit/-l` | — |
| `create` | （无；body 走 stdin 字段） | — |
| `edit` | `--old/-o` `--new/-n` `--new-stdin` `--dry-run` | — |
| `write` | `--dry-run` | — |
| `delete` | （无） | — |
| 全局 | `--json`（强制注入，语法里写不写都行） | **`--vault` 恒拒绝**（§6.1）；`-h/--help/-V` 拒绝（协议外信息无意义） |
| `publish` / `mcp` / `completion` | — | 白名单外，恒拒绝 |

**字符黑名单**（在 shell-words 分词**之后**对 token 复查，防绕过）：

```
|  ;  &  >  <  `  $  (  )  {  }  [  ]  !  *  ?  ~  #  \n  \r
```

分词后 token 里出现任一黑名单字符 → 拒绝。注意两点：

1. **引号内的这些字符同样拒绝**（比真实 shell 更严）——唯一例外是 *值内部*
   的业务字符（如笔记标题里的 `*` 强调语法）怎么办？→ 不放宽。需要编辑
   含特殊字符的文本时走 `stdin` 字段（`edit --new-stdin` + `stdin`），
   stdin 内容不做黑名单检查（它永远是数据，永远不进 shell）
2. 黑名单在**分词后**复查而非分词前整串扫描：分词已消化掉引号与转义，
   复查的是"实际会变成 argv 的字符"，语义最准确

**长度限制**：`syntax` ≤ 4 KB；`stdin` ≤ 10 MB（随消息上限）。

### 4.4 解析管线（mcp.rs 内部五步）

```
tools/call {name, arguments}
  1. name != "tydora_note"           → 工具错误 "unknown tool"
  2. arguments.syntax 缺失/超长       → 工具错误（含 inputSchema 提示）
  3. shell_words::split(syntax)      → 分词失败（引号不闭合）→ 工具错误
  4. 命令白名单 + 每命令 flag 白名单 + token 黑名单 + --vault 拒绝
                                      → 工具错误（附合法用法示例）
  5. 组装 argv = [bin, "--json", ...tokens]，Cli::parse(argv) 复用
     （clap 层再校验一次：positional 缺失等 → CliError::Usage → 工具错误）
```

第 5 步复用 `Cli::parse` 而不是自建参数结构，保证：CLI 帮助文本里的用法、
MCP 错误提示、真实行为三者永远一致（单一事实源是 clap 命令树）。

---

## 5. 执行与输出

### 5.1 关键前置重构：输出 sink 化（MCP 的最大改动点）

现状：`dispatch.rs` 调 `output::emit_*(...)`，后者直接 `println!`。
MCP 模式下 stdout 是协议专线，**命令结果必须落到内存缓冲**。

重构方案（对现有代码侵入最小）：

1. `dispatch(cli) -> CliResult<()>` 改为
   `dispatch_to<W: Write>(cli, out: &mut W) -> CliResult<()>`
2. `output.rs` 全部 `emit_*` 增加尾参 `out: &mut W`（`println!` → `writeln!`，
   JSON 序列化结果不变）
3. 兼容壳保留：
   ```rust
   pub fn dispatch(cli: Cli) -> CliResult<()> {
       let stdout = std::io::stdout();
       dispatch_to(cli, &mut stdout.lock())
   }
   ```
   `main.rs` / 测试零改动
4. `emit_stderr_warn` 同理 sink 化（MCP 模式下警告并进结果的 `warnings` 数组）
5. `read_stdin_body()` 参数化：
   ```rust
   pub(crate) enum BodySource { RealStdin, Buffer(String) }
   pub(crate) fn read_body(src: &BodySource) -> CliResult<String>
   ```
   dispatch 持有 `BodySource`，CLI 入口 = RealStdin，MCP 入口 = Buffer(stdin 字段)
6. `CommandKind::Edit/Write/Create` 的 dry-run 语义不变（MCP Agent 想预览就传 `--dry-run`）

预计改动：`output.rs`（361 行，机械替换）+ `dispatch.rs`（128 行）+
`store.rs`（stdin 读取一处）。改完 CLI 现有 38 个测试必须原样全过
（这是重构验收线）。

### 5.2 tools/call 的返回封装

MCP `tools/call` 结果结构（对 Agent 最友好的双层封装）：

```json
{
  "content": [{
    "type": "text",
    "text": "{ ...CLI --json 输出原样内嵌... }"
  }],
  "structuredContent": { "schema": "tydora.search.v1", "...": "..." },
  "isError": false
}
```

- **`structuredContent`** = CLI JSON 解析后的对象（MCP 规范的
  structured output；typed 客户端直接读字段）
- **`content[0].text`** = 同一 JSON 的紧凑字符串（不解析 structuredContent
  的客户端 / LLM 直读用）
- 两份内容同源同值，只是表示形式不同

### 5.3 错误映射（两层区分）

| 层 | 触发 | 形态 |
|----|------|------|
| **协议错误**（JSON-RPC error） | 非法 JSON、未知方法、batch、id 类型错 | `{"error": {"code": -32700/-32600/-32601/..., "message": ...}}` |
| **工具错误**（isError: true） | 白名单拒绝、Usage 错、NotFound、IO 失败、命令非零退出 | `tools/call` 正常响应 + `isError: true` + `content[0].text` = 人读错误信息 |

工具错误不升格为协议错误——MCP 规范要求业务失败对 Agent 可见可自纠，
而不是让客户端把它当协议故障。

`CliError` → 工具错误文案映射（保留退出码语义于文案前缀）：

| CliError | 文案前缀 | Agent 自纠提示 |
|----------|---------|---------------|
| `Usage` (2) | `usage: ...` | 附该命令的合法 flag 清单 + 一个正确示例 |
| `NotFound` (3) | `not found: ...` | 附 `list` 用法（先列再取） |
| `Io` (5) | `io: ...` | 提示 vault 可能被外部程序占用 |
| `Other` (1) | 原文 | — |

### 5.4 JSON schema 一览（MCP 直接透传，零转换）

| 命令 | schema | 说明 |
|------|--------|------|
| notebooks | `tydora.vault.v1` | vault 概览 |
| list | `tydora.notebook.v1` | 笔记列表 |
| show | `tydora.note.v1` | 完整笔记（frontmatter + body） |
| search | `tydora.search.v1` | 检索命中（行号 + 行文本样本） |
| create | `tydora.create.v1` | 新建结果（id / path / size） |
| edit | `tydora.edit.v1` | 替换结果（bytes_delta；dry-run 带 body_preview） |
| write | `tydora.write.v1` | 覆盖结果 |
| delete | `tydora.delete.v1` | trash 路径（可恢复） |
| publish | `tydora.publish.v1` | 仅 `--allow-publish` 时可达 |

Agent 侧使用建议（写进工具 description 的补全提示）：**先 notebooks/list
摸清结构 → show 看内容 → search 定位 → 写操作默认带 --dry-run 预览**。

---

## 6. 安全模型

### 6.1 vault 钉死（最重要的一条）

`--vault` 在受限语法中**恒拒绝**（含 `--vault=path` 形式，`=` 拼接在
clap 解析前由白名单拦截）。vault 由 MCP 服务器进程的环境决定：

```
resolve_vault() 的既有优先级在 MCP 场景收窄为：
  $TYDORA_VAULT（客户端配置注入）> $TYDORA_HOME/vaults/default
（cwd/.tydora 兜底保留但 MCP 客户端通常显式设 env）
```

效果：Agent 无论怎么构造 syntax，都只能操作启动配置钉死的那个 vault，
无法通过工具调用越权到任意路径。路径穿越（`../`）由已有的
`note::resolve_note_path` 拒绝（有测试覆盖）。

### 6.2 读/写分级开关

| 启动 flag | 白名单 |
|-----------|--------|
| `tydora mcp`（默认） | notebooks / list / show / search + create / edit / write / delete |
| `tydora mcp --read-only` | 仅 notebooks / list / show / search |
| `tydora mcp --allow-publish` | 默认集 + publish |

写操作为什么默认开：CLI 的写路径已有三重兜底——dry-run 预览、原子写、
delete 进 trash 可恢复；MCP 客户端（Claude Code 等）本身有人工确认环节。
仍给保守用户留 `--read-only`。publish 默认关（spawn 外部 node 进程 +
分钟级耗时，见 §1.2）。

### 6.3 与 GUI 的并发（复用 Phase 2 结论）

- MCP 写入 = CLI 写入 = `.tmp + rename` 原子落盘，GUI 的 fs watcher
  （`useVaultWatcher` + `watcher_commands.rs`）监听到变更后 reload
- 回声防护沿用现状：watcher 以 mtime/内容 diff 判断，rename 覆盖
  触发一次 reload，不循环（Phase 2 的 `cli` 写入已被 GUI 消费验证）
- 遗留边界：若 Agent 正在 edit 同一文件且用户同时在 TipTap 编辑，
  后写覆盖先写（无文件锁）——与两个 GUI 窗口互写的风险等级相同，
  不在 MCP 层解决，文档里写明（§10 风险 3）

### 6.4 资源与滥用限制

- 单请求处理是同步的：恶意大 `search`（无 limit）最多扫全 vault 文件一遍，
  有 16 MB/文件跳过上限；考虑默认对无 `--limit` 的 search 注入
  `--limit 50`？→ **不注入**（保持 CLI 语义透明），靠 `--read-only` +
  客户端超时兜底，文档注明大 vault 建议 Agent 主动带 limit
- `delete` 无法绕过 trash（实现层面没有硬删路径）
- `create` 的 slug 冲突自动 `-2/-3`，不会覆盖已有文件（有测试覆盖）

---

## 7. 客户端接入配置

以下均以 Windows 路径为例（macOS/Linux 换对应二进制路径）。

### 7.1 Claude Code

```bash
claude mcp add tydora -- D:\code\Tydora\target\release\tydora-cli.exe mcp
```

或项目级 `.mcp.json`：

```json
{
  "mcpServers": {
    "tydora": {
      "command": "D:\\code\\Tydora\\target\\release\\tydora-cli.exe",
      "args": ["mcp"],
      "env": { "TYDORA_VAULT": "D:\\Notes\\MyVault" }
    }
  }
}
```

### 7.2 Codex CLI

`~/.codex/config.toml`：

```toml
[mcp_servers.tydora]
command = "D:\\code\\Tydora\\target\\release\\tydora-cli.exe"
args = ["mcp"]

[mcp_servers.tydora.env]
TYDORA_VAULT = "D:\\Notes\\MyVault"
```

### 7.3 Cursor / 其它通用 stdio 客户端

`~/.cursor/mcp.json`（或客户端等价配置）：

```json
{
  "mcpServers": {
    "tydora": {
      "command": "D:\\code\\Tydora\\target\\release\\tydora-cli.exe",
      "args": ["mcp", "--read-only"],
      "env": { "TYDORA_VAULT": "D:\\Notes\\MyVault" }
    }
  }
}
```

### 7.4 分发后的路径（与 sidecar 对齐）

随安装包分发时，sidecar 位于安装目录（externalBin 产物与主程序同级）：

- Windows NSIS：`C:\Program Files\Tydora\tydora-cli.exe`（bundler 会去
  target-triple 后缀）
- 配置示例写相对推导说明，README 给出"找到安装目录下的 tydora-cli.exe"指引

---

## 8. 实施计划

### 8.1 依赖决策：零新依赖（复核）

- 协议层只需 JSON 解析/序列化（`serde_json` 已有）+ 行分帧（`std::io::BufRead`）
- 语法解析只需 `shell_words`（**已在 Cargo.toml，Phase 1 就为 MCP 预留**）
- 不引入官方 Rust SDK `rmcp`：它拖 tokio 全家桶 + 运行时，与 CLI 的
  "std-only 轻量二进制"定位冲突；且本方案只用到 tools 三个方法，
  手写 ≤ 300 行。**若未来要 HTTP/SSE 传输或 resources 能力再评估 rmcp**

### 8.2 代码改动清单

| 文件 | 改动 | 规模 |
|------|------|------|
| `src/mcp.rs`（新） | 协议循环 + 方法路由 + 受限语法解析器 + 工具封装 | ~450 行 |
| `src/output.rs` | emit_* sink 化（尾参 `&mut W`） | 机械替换 ~361 行 |
| `src/dispatch.rs` | `dispatch_to<W>` 泛型化 + BodySource 注入 | ~40 行 |
| `src/store.rs` | `read_stdin_body` → `read_body(BodySource)` | ~15 行 |
| `src/lib.rs` | `pub mod mcp;` + `run_mcp_server(flags)` 入口 | ~10 行 |
| `src/cli.rs` | mcp 子命令加 `--read-only` / `--allow-publish` flag | ~20 行 |
| `src/main.rs` | mcp 分支不切 codepage（无控制台），直接进服务器 | ~5 行 |
| `tests/mcp_e2e.rs`（新） | 见 §9 | ~250 行 |
| `app/tydora-cli/README.md` + `CLAUDE.md` | MCP 章节 | 文档 |

### 8.3 分阶段落地

**Phase 4a — 协议地基（先跑通读路径）**
1. output/dispatch sink 化重构（38 测试全过为验收线）
2. mcp.rs：initialize / ping / tools/list / tools/call 路由 + NDJSON 循环
3. 受限语法解析器（分词 → 白名单 → 黑名单 → argv 组装）
4. 只读命令（notebooks / list / show / search）端到端可调
5. mcp_e2e.rs：握手 + tools/list + show 往返

**Phase 4b — 写路径与开关**
1. BodySource 注入，create / edit / write / delete 可调
2. `--read-only` / `--allow-publish` flag
3. 错误文案打磨（自纠提示）
4. 全部测试 + 文档

**Phase 4.5（可选，另出方案）**
- resources：`note://<id>` URI 暴露笔记为 MCP resources（只读）
- progress 通知、cancelled 真实取消
- `docs/mcp-client-guide.md` 面向终端用户的接入手册

---

## 9. 测试策略（tests/mcp_e2e.rs）

复用 `cli_smoke.rs` 的 fixture 模式：`assert_cmd` spawn
`Command::cargo_bin("tydora-cli").args(["mcp"])`，向 stdin 写 NDJSON、
按行读 stdout 断言。不引入任何测试框架。

| 用例 | 断言 |
|------|------|
| handshake_ok | initialize 响应含 serverInfo.name=tydora、capabilities.tools |
| protocol_version_echo | 客户端发 2025-03-26 → 原样回显；发 1999-01-01 → 回 2025-06-18 |
| ping_returns_empty | `{}` |
| tools_list_single_tool | 恰好 1 个工具，name=tydora_note，inputSchema 含 required syntax |
| call_show_roundtrip | `show notes/daily` → structuredContent.schema=tydora.note.v1，body 含 "body" |
| call_search_json | search 命中 + is_error=false |
| call_json_output_forced | syntax 里不带 --json，返回仍是 JSON schema（强制注入验证） |
| reject_shell_metachar | `show foo; rm -rf /` → isError=true，文案含 "not allowed" |
| reject_vault_flag | `show x --vault C:\Windows` → isError=true，文案含 "vault" |
| reject_unknown_command | `publish`（默认）→ isError=true（白名单外） |
| reject_unclosed_quote | `search "abc` → isError=true |
| usage_error_from_clap | `edit 无参数` → isError=true，文案含 flag 清单 |
| not_found_is_tool_error | `show nope` → isError=true，非协议错误 |
| stdin_field_used | create + stdin 字段 → 文件创建成功且内容一致 |
| read_only_flag_blocks_write | `--read-only` 下 create → isError=true |
| parse_error | stdin 喂 `{bad json` → -32700 |
| unknown_method | `resources/list` → -32601 |
| eof_exits_zero | 关 stdin → 进程 exit 0 |
| no_bare_newline_in_output | 所有响应行都是单行合法 JSON（逐行 serde_json 解析通过） |

同时保底：`cli_smoke.rs` 的 38 个用例在 sink 重构后必须原样全过。

---

## 10. 风险与待澄清

| # | 风险/问题 | 处置 |
|---|-----------|------|
| 1 | MCP 规范演进（2025-06-18 之后的版本可能加能力） | 版本协商已按规范建议处理；支持集是常量数组，加版本 = 改一行 |
| 2 | 手写协议层 vs rmcp 的正确性风险 | 用 §9 的 19 个 e2e 用例覆盖；协议错误码与帧格式逐条对照规范；必要时后续切 rmcp（mcp.rs 是唯一触点） |
| 3 | Agent 与用户同时在 GUI 编辑同一文件的丢写 | 与"两个 GUI 窗口互写"同级风险，文档声明；GUI 侧未来可加 mtime 冲突检测（另立方案） |
| 4 | search 无 limit 在超大 vault 上的耗时 | CLI 侧 16MB/文件上限已有；文档建议 Agent 带 --limit；必要时后续加服务器级默认 limit |
| 5 | Windows 安装后路径空格（C:\Program Files\Tydora\） | stdio spawn 不经过 shell，无空格问题；客户端配置用 JSON 数组形式即可 |
| 6 | 未来并发需求（Agent 并行多工具调用） | MCP 规范允许客户端并行 call；首版串行——若实测有阻塞感，加 crossbeam 队列 + 每请求独立 vault 快照（另评估） |
| 7 | **待澄清**：GUI 桌面端要不要内置"MCP 开关"（设置页一键把本机 tydora-cli 注册进 Claude Code）？ | 建议后置：先让手动配置可用，采集用户反馈再决定是否做 GUI 引导 |
| 8 | **待澄清**：`stdin` 字段名是否够直观？ | 备选：`body`。倾向保留 `stdin`（与 CLI 心智一致：create/write 都是 "body from stdin"） |

---

## 11. 参考资料

- `docs/cli-implementation-plan.md` §4.4（MCP 约束的原始预设）
- `app/tydora-cli/src/cli.rs` / `dispatch.rs` / `output.rs`（被复用的执行链）
- `app/tydora-cli/src/store.rs`（全部业务实现与 JSON schema）
- MCP 规范：https://modelcontextprotocol.io（tools / stdio transport / 版本协商）
- 客户端配置：Claude Code `claude mcp add`、Codex `config.toml`、Cursor `mcp.json`
