# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Tydora（代码内称为 "zmd"、包名前缀 `com.tydora`）是一个基于 Tauri v2 + React 19 的桌面 Markdown
编辑器。支持 WYSIWYG（即时渲染）与源码两种编辑模式，以"仓库（Vault）"为文件管理单位，内置
白板、知识图谱、思维导图、内嵌终端、Vim 模式、导出与发布等能力。中文 / 英文双语界面。

## 技术栈

- **前端**: React 19 + TypeScript 5.6 + Vite 6（单仓 npm 项目，**非 monorepo**）
- **后端**: Rust (Tauri v2)，Windows 为主要目标平台
- **编辑器**: TipTap 3.x（WYSIWYG / 即时渲染）+ CodeMirror 6（源码模式）+ `tiptap-markdown`（Markdown 序列化）
- **编辑器增强**: lowlight（代码高亮）、KaTeX（数学公式）、Mermaid（图表）、`vim-prose`（Vim 模式）
- **可视化**: React Flow（白板 Canvas + 知识图谱）、自研思维导图
- **终端**: `portable-pty`（Rust 侧真实 PTY）+ 前端自绘终端视图
- **国际化**: i18next / react-i18next（`zh-CN` / `en-US`）
- **状态**: 全局用 App.tsx 的 `useState` + localStorage；仅白板使用 Zustand
- **Tauri 插件**: `fs` / `dialog` / `window-state` / `updater` / `process` / `clipboard-manager` / `single-instance`

## 常用命令

```bash
# 安装依赖（postinstall 会自动执行 patch-package）
npm install

# 开发模式（Vite dev server，端口 1420）
npm run dev

# 构建前端（tsc 类型检查 + Vite 打包）
npm run build

# 预览生产构建
npm run preview

# 启动 Tauri 桌面应用 — 通过 scripts/run-tauri.mjs 加载 .env 签名密钥
npm run tauri

# 版本号（从 VERSION 同步到全部配置）
npm run sync-version

# 打包
npm run build:msix             # Windows MSIX（scripts/build-msix.ps1）
npm run build:cli              # bash scripts/cli-build.sh
npm run build:cli:win          # powershell scripts/cli-build.ps1

# CLI
npm run cli:test               # cd app && cargo test --bin tydora-cli
npm run cli:run -- --version   # cd app && cargo run --bin tydora-cli --

# 文档站（markdown-publish）
npm run docs:build             # node scripts/build-docs.mjs（中英两份 config 依次构建）
npm run docs:serve             # node website/site/__preview_server.cjs
npm run docs:clean             # rimraf website/site
npm run deploy:edgeone         # 部署文档站到 EdgeOne

# 提交与变更日志
npm run commit                 # cz（commitizen + commitlint）
npm run changelog              # git-cliff -o CHANGELOG.md
npm run lint:commit            # commitlint --from HEAD~1
```

**注意**：项目**没有** test / eslint / prettier 脚本。`npm run build` 自带 `tsc` 类型检查
（`noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch` 全开）。
`scripts/run-tauri.mjs` 负责把 `.env` 中的签名密钥注入环境后再转发给 `npx tauri`。

## 版本管理

所有版本号从仓库根 `VERSION` 文件单向同步（当前 `0.2.6`）：

```bash
VERSION                          # 唯一源，纯文本版本号
npm run sync-version             # 同步到：
                                 # - app/Cargo.toml（[workspace.package] version，成员 crate 继承）
                                 # - app/tydora-desktop/tauri.conf.json
                                 # - package.json
```

**发布流程**：改 `VERSION` → `npm run sync-version` → 构建（`npm run tauri` 的 beforeBuild 也会自动同步）。
Release 由 `release-please` 驱动（见 `release-please-config.json`），变更日志由 `git-cliff` 生成（`cliff.toml`）。

## 架构概览

### 前端目录（`app/tydora-web/src/`）

2026-09 的大规模整理后，前端不再是"扁平 src 根"，而是按功能域分目录：

| 目录            | 职责                                                     |
| ------------- | ------------------------------------------------------ |
| `Editor/`     | TipTap / CodeMirror 编辑器、自定义扩展、快捷键、对话框、frontmatter    |
| `themes/`     | 内置 / 自定义主题、代码配色、主题 Token、外观工具                          |
| `wikilink/`   | `[[wiki-link]]` 解析、索引、DOM 处理、自动补全、预览、反链面板               |
| `tags/`       | 标签解析 / 索引 / 自动补全 / 标签面板                                 |
| `Bookmarks/`  | 书签服务与面板                                                |
| `graph/`      | 知识图谱（全局 `GraphView` + 局部 `LocalGraph` + 独立窗口 `GraphWindow`） |
| `mindmap/`    | 思维导图视图与独立窗口                                            |
| `Canvas/`     | 白板（React Flow + Zustand，节点 / 边 / 工具栏 / 设置）              |
| `Terminal/`   | 内嵌终端视图、设置、右键菜单、OSC 标题解析、终端 API                         |
| `vim/`        | Vim 模式（leader、前缀键 G/M/T/Z、分屏导航、文件树、TipTap 与 CodeMirror 适配） |
| `export/`     | 导出实现（HTML / PDF / PNG / 微信 / 小红书图文）                      |
| `publish/`    | 发布面板、发布配置、发布服务                                         |
| `VaultManager/` | 管理仓库独立窗口                                              |
| `components/` | 通用组件（命令面板、快速打开、查找替换、文件预览、确认框、字体选择等）                    |
| `services/`   | 非 UI 服务（图片管理、自动更新、链接索引、文件扫描、窗口状态）                      |
| `hooks/`      | 通用 Hook（如 `useDebounce`）                                |
| `config/`     | `shortcuts.json`（快捷键默认表）                               |
| `i18n/`       | 语言 Context 与 `locales/zh-CN.json`、`locales/en-US.json`  |
| `utils/`      | 字体、菜单密度等工具                                             |
| `analytics/`  | 隐私同意对话框                                                |

顶层仅保留 `App.tsx` / `Settings.tsx` / `Sidebar.tsx` / `main.tsx` 与少量工具文件。

### 应用入口与多窗口

`main.tsx` 是全部窗口的唯一 HTML 入口，按 URL 参数 `?window=` 懒加载不同窗口组件：

| `?window=`     | 组件                     |
| -------------- | ---------------------- |
| （无，主窗口）        | `App.tsx`              |
| `settings`     | `Settings.tsx`         |
| `vault-manager`| `VaultManager/VaultManagerWindow.tsx` |
| `mindmap`      | `mindmap/MindmapWindow.tsx` |
| `graph`        | `graph/GraphWindow.tsx` |
| `canvas`       | `Canvas/CanvasWindow.tsx` |
| `editor`       | `App.tsx`（新建独立编辑窗口，携带文件路径参数） |

启动即挂载 `ThemeProvider` → `LanguageProvider` → `VimProvider`，并调用
`applyMenuDensityFromStorage()`、`connectRustBootTiming()`（Rust 端启动耗时打点）。
`main.tsx` 还负责吞掉 `ResizeObserver loop` 良性告警。

### 状态与持久化

主窗口状态集中在 `App.tsx`（`content` / `fileName` / `modified` / `viewMode` / `vaults` /
`activeVaultIndex` / `sidebarOpen` / 右侧栏 / 分屏 pane 等），持久化到 localStorage。
主要键（均为 `zmd-` 前缀）：

- 仓库：`zmd-vaults`、`zmd-active-vault`、`zmd-index-vault`、`zmd-link-index`、`zmd-tag-index`
- 界面：`zmd-appearance-mode`、`zmd-preferred-app-theme`、`zmd-preferred-code-theme`、
  `zmd-theme` / `zmd-code-theme`（旧键，兼容写入）、`zmd-language`、`zmd-general-settings`
- 侧栏：`zmd-sidebar-width`、`zmd-sidebar-scroll-<key>`、`zmd-right-sidebar-open`、`zmd-right-sidebar-width`
- 编辑器：`zmd-editor-settings`、`zmd-shortcuts`、`zmd-pinned-toolbar-items`、`zmd-recent-files`、`zmd-recent-commands`
- 功能域：`zmd-bookmarks`、`zmd-canvas-settings`、`zmd-graph-settings`、`zmd-mindmap-settings`、`zmd-mindmap-content`、`zmd-image-settings`、`zmd-vim-config`
- 窗口：`zmd-window-state`、`zmd-editor-window-state`、`zmd-settings-window-state`、`zmd-mindmap-window-state`、`zmd-vault-manager-window-state`

窗口位置 / 大小通过 Tauri Window API 恢复并防抖保存（`services/windowState.ts`）。

### 主题系统（`themes/`）

主题采用「**外观模式（system / light / dark）+ 明暗主题对**」模型，而非单一切换：

- `ThemeManager.ts` — **10 种内置主题**：`white`、`mint`、`mint-dark`、`modern-dark`、
  `claude-code`、`purple`、`hermes`、`next`、`slate`、`ocean`；
  仅 `mint-dark` 与 `modern-dark` 是暗色主题（见 `appearance.ts` 的 `BUILTIN_THEME_IS_DARK`）
- `appearance.ts` — 外观核心逻辑：
  - `zmd-appearance-mode`（`system` / `light` / `dark`）
  - 默认主题对：亮 `white` / 暗 `mint-dark`（`DEFAULT_APP_THEME_PAIR`）
  - 默认代码配色对：亮 `github-light` / 暗 `github-dark`
  - 旧键 `zmd-theme` / `zmd-code-theme` 仍作为"已解析的当前主题 id"写入（兼容迁移）
- `CustomThemeManager.ts` — 自定义主题导入 / 导出 / 管理，存于 Tauri `appDataDir`（id 前缀 `custom-`）
- `codeThemes.ts` — **11 种**代码语法高亮配色；`codeThemeTokens.ts` 提供 Token 级映射
- `themeTokens.ts` / `themePack.ts` / `colorUtils.ts` — 主题变量、主题包与颜色工具
- `ThemeContext.tsx` — 通过 `document.documentElement.dataset.theme` 应用主题；
  切换时同步更新代码高亮样式，并派发 `appearance-state-changed` 事件让其他窗口同步；
  `themes/index.ts` 统一 re-export

### 侧栏（`Sidebar.tsx`）

侧栏支持**左右两侧**分别放置页签，页签类型定义在 `Settings.tsx`：

```ts
export type SidebarTab = "files" | "search" | "outline" | "bookmarks" | "tags";
```

- **FileTree** — 递归文件树：展开 / 折叠、右键菜单（新建 / 重命名 / 删除 / 复制路径）、
  内联重命名、拖拽移动、反链徽标
- **Search** — 全仓库内容搜索，命中由 `Editor/extensions/search-highlight.ts` 高亮
- **Outline** — Markdown 标题大纲（含 Graph 分区），点击滚动到对应位置
- **Bookmarks** — 书签列表（`Bookmarks/`）
- **Tags** — 标签面板，支持列表 / 图谱两种视图与筛选搜索（`tags/TagPanel.tsx`）

页签可在设置中分配左 / 右，支持拖拽换侧。底部为仓库切换器（VaultSwitcher）。

### 编辑器附加能力

| 能力         | 实现位置                                                    |
| ---------- | ------------------------------------------------------- |
| 数学公式       | `Editor/extensions/math.ts` + KaTeX（`MathDialog.tsx` 编辑） |
| Mermaid 图表 | `Editor/extensions/mermaid.ts` + `mermaid-language.ts`   |
| Callout 块  | `Editor/extensions/callout.ts`                           |
| 标签         | `Editor/extensions/tag.ts` + `tags/TagAutocomplete.tsx`  |
| 表格浮动工具栏    | `Editor/extensions/table-floating-toolbar.ts`            |
| 代码块工具栏     | `Editor/extensions/code-block-toolbar.ts`                |
| 查找与替换      | `components/FindReplaceDialog.tsx`                       |
| 分屏         | `App.tsx` 的 pane 机制（左右 `lr` / 上下 `tb`，`editor-split-pane`） |
| 链接 / 数学对话框  | `Editor/LinkDialog.tsx` / `Editor/MathDialog.tsx`        |

### 标签系统（`tags/`）

`TagIndexService.ts` 维护全仓库 `#tag` 索引，`TagAutocomplete.tsx` 在 `#` 触发补全，
`TagPanel.tsx` 提供列表与关系图谱两种视图，`tagSearch.ts` 做筛选。

### Vim 模式（`vim/`）

基于 `vim-prose` + 自研扩展，`VimProvider.tsx` 提供上下文；`config/` 下按前缀键拆分配置
（`leader.ts`、`prefixG/M/T/Z.ts`、`conflictKeys.ts`）；`tiptap/` 与 `codemirror/` 分别适配两种
编辑模式；`panes/PaneNavigator.ts` 负责分屏间光标跳转；`filetree/`、`navigation/`、`settings/`
覆盖文件树操作、导航与设置。配置持久化于 `zmd-vim-config`。

### 终端（`Terminal/`）

Rust 侧 `commands/terminal_commands.rs` 用 `portable-pty` 开启真实交互式 PTY，
暴露 `spawn_terminal` / `write_terminal` / `resize_terminal` / `kill_terminal` 四个命令，
由 `Terminal/TerminalView.tsx` 渲染，`terminal-settings.ts` 管理配色与字体，
`oscTitleParser.ts` 解析 OSC 转义序列（标题 / 当前目录）。

### 导出（`export/`）

`exporters.ts` 提供 `buildHtmlDoc`（HTML）、`exportPdfBytes`（PDF）、`renderToPng`（PNG）、
`buildWechatHtml`（微信公众号）；`xiaohongshu/` 是小红书图文分页预览与出图
（`XhsPreviewPanel.tsx` / `paginate.ts` / `render.ts` / `themes.ts`）。
`components/ExportPreviewDialog.tsx` 提供导出前预览。

### 后端（`app/tydora-desktop/`）

2026-09-09 重构后，原 `src-tauri/` 整体搬入 Cargo workspace 成员 `app/tydora-desktop/`
（包名 `tydora-desktop`，lib 名保留 `tydora_lib`；`vendor/wry` 的 `[patch]` 上移到
workspace 根 `app/Cargo.toml`，成员级 `[patch]` 会被 cargo 忽略）。

**入口**: `src/main.rs` → `tydora_lib::run()`（`src/lib.rs`）

**源码结构**:

```
app/tydora-desktop/src/
├── main.rs
├── lib.rs                     # 插件注册、45 个命令注册、状态管理、URI scheme
└── commands/
    ├── mod.rs
    ├── file_commands.rs       # 目录列表、文件操作
    ├── font_commands.rs       # list_system_fonts（fontdb）
    ├── proxy.rs               # 本地代理服务器（axum）
    ├── remote_image.rs        # 远程图片下载
    ├── terminal_commands.rs   # PTY 终端（portable-pty）
    └── watcher_commands.rs    # 文件监听（notify）
```

**Tauri 插件**（7 个）:

| 插件                             | 用途                |
| ------------------------------ | ----------------- |
| `tauri-plugin-fs`              | 文件系统访问            |
| `tauri-plugin-dialog`          | 系统对话框             |
| `tauri-plugin-window-state`    | 窗口状态持久化           |
| `tauri-plugin-updater`         | 应用自动更新            |
| `tauri-plugin-process`         | 进程管理              |
| `tauri-plugin-clipboard-manager` | 剪贴板读写           |
| `tauri-plugin-single-instance` | 单实例运行，转发文件关联打开请求  |

**自定义 Tauri 命令**（45 个，注册于 `lib.rs` 的 `invoke_handler`）:

| 分组     | 命令                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| 内容与版本  | `get_default_content`、`get_app_version`、`get_cwd`、`is_store_version`、`is_portable_version`                            |
| 外部文件打开 | `take_pending_files`、`has_pending_files`、`open_file`、`open_file_location`、`open_file_in_new_window`、`open_url`、`open_directory`、`open_in_terminal`、`duplicate_file`、`copy_file_to_clipboard` |
| 窗口     | `open_settings_window`、`open_mindmap_window`、`open_graph_window`、`open_canvas_window`、`open_canvas_in_new_window`、`open_vault_manager_window`、`open_vault_in_new_window`、`close_all_editor_windows`、`notify_main_closing` |
| 仓库与监听  | `move_vault`、`watch_vault`、`unwatch_vault`、`list_dir_with_meta`                                                        |
| 更新     | `check_github_update`、`check_portable_update`、`switch_to_github_update`、`install_portable_update`                       |
| 发布与预览  | `run_markdown_publish`、`preview_site`、`stop_preview`                                                                   |
| 网络与资源  | `fetch_remote_image`、`fetch_page_title`、`start_proxy_server`                                                           |
| 导出     | `create_export_file`、`append_export_file`（分块写入，规避大文件堆损坏）                                                                |
| 终端     | `spawn_terminal`、`write_terminal`、`resize_terminal`、`kill_terminal`                                                    |
| 字体     | `list_system_fonts`                                                                                                    |

**状态管理**（`lib.rs` 的 `setup()` 中 `app.manage(...)`）:

- `WatcherState` (`Mutex<Option<RecommendedWatcher>>`) — 仓库文件监听
- `PreviewServer` (`Mutex<Option<Child>>`) — 预览 HTTP 服务器子进程
- `HttpClientState` — 复用的 reqwest 客户端
- `PendingFiles` (`Mutex<Vec<String>>`) — 文件关联启动的待打开队列
- `MainWindowClosing` — 主窗口关闭标记
- `TerminalManager` — PTY 会话表

**其他**:

- `register_uri_scheme_protocol("local-file", ...)` — 自定义 URI scheme，加载本地文件
- Debug 模式自动打开 DevTools；`windows_subsystem = "windows"` 避免 release 出现控制台

**Rust 依赖**: `serde` / `serde_json`、`notify` 6、`reqwest`（json+gzip+deflate+brotli）、
`zip`、`base64`、`portable-pty`、`axum` + `tokio`、`url`、`fontdb`；macOS 额外用
`objc2` / `objc2-app-kit` 做原生圆角。

### 多窗口架构

| 窗口      | 触发方式                          | 默认大小     | 说明            |
| ------- | ----------------------------- | -------- | ------------- |
| 主窗口     | 应用启动                          | 1200×800 | 编辑器、侧栏等核心 UI  |
| 设置窗口    | `open_settings_window`        | 800×600  | 独立设置面板（无装饰）   |
| 文件窗口    | `open_file_in_new_window`     | 1200×800 | 在独立窗口中编辑文件    |
| 仓库管理窗口  | `open_vault_manager_window`   | —        | 管理仓库          |
| 图谱窗口    | `open_graph_window`           | 1000×700 | 知识图谱可视化       |
| 思维导图窗口  | `open_mindmap_window`         | 900×600  | 思维导图可视化       |
| 白板窗口    | `open_canvas_window` / `open_canvas_in_new_window` | —        | 白板（后者非单例）     |

各窗口渲染各自的 React 组件树（由 `main.tsx` 按 `?window=` 懒加载），
通过序列化的 JSON 数据（如 `LinkIndexService` 序列化的链接索引，经 localStorage / 事件总线）共享状态。

### 文件关联打开（双击 .md 文件）

通过 `tauri-plugin-single-instance` + `PendingFiles` 队列实现，避免固定延迟发事件与前端监听注册之间的竞态：

- **冷启动**：`setup()` 过滤命令行参数中的 `.md` / `.markdown` / `.mdx` 路径放入 `PendingFiles`；
  前端 App 挂载后调用 `take_pending_files` 主动拉取（取出即清空），并在 1.2s 后二次拉取兜底
  （`has_pending_files` 用于探测）
- **已运行时**：单实例回调聚焦主窗口、把路径推入队列并发 `open-file-external` 事件；
  前端收到事件后以队列为准拉取（事件负载仅作兜底）
- **前端处理**（`App.tsx` 的 `handleExternalOpenFile`）：折叠侧栏（与新窗口体验一致）、
  激活文件所属仓库、走 `handleSelectFile` 正常打开流程
- 无仓库时自动弹管理仓库窗口的逻辑会等待外部文件解析完成，存在外部文件时不弹窗

### Tauri 配置 (tauri.conf.json)

- **位置**: `app/tydora-desktop/tauri.conf.json`
- **标识符**: `com.tydora.editor`；`productName`: `Tydora`；版本与 `VERSION` 同步
- **窗口**: 1200×800，居中，无装饰，可调整大小
- **打包**: Windows (NSIS)、macOS (DMG)、Linux (AppImage)；另见 MSIX（`msix/AppxManifest.xml`）
- **CSP**: `null`（允许加载本地资源）
- **自动更新**: 公钥签名验证，端点指向 GitHub Releases
- **hooks**: `beforeDevCommand` = `npm run sync-version && npm run dev`，
  `beforeBuildCommand` = `npm run sync-version && npm run build`（在仓库根执行）
- **frontendDist**: `../../.build/web-dist`（相对 tauri.conf.json 所在目录）
- **capabilities** (`app/tydora-desktop/capabilities/default.json`): 文件系统全路径读写、窗口控制、
  对话框、更新器、进程管理、剪贴板权限

**⚠️ 产物命名**：Tauri v2 的 `tauri build` **不会重命名** standalone 二进制 ——
`target/release/` 下是 cargo bin 名，即 `tydora-desktop.exe`（CLI 为 `tydora-cli.exe`）；
只有 bundle 产物（NSIS = `Tydora_<ver>_x64-setup.exe`）用 `productName`。
任何引用 `target/release/Tydora.exe` 的脚本都是错的。cargo 产物统一在仓库根 `target/`
（由 `app/.cargo/config.toml` 的 `target-dir = "../target"` 决定）。

### 构建配置

- **Vite** (`vite.config.ts`): `@vitejs/plugin-react`，端口 1420 严格模式，`clearScreen: false`
  （避免覆盖 Rust 编译错误），忽略 `**/src-tauri/**` 的文件监听
- **TypeScript**: target ES2020，严格模式，`noUnusedLocals` / `noUnusedParameters` /
  `noFallthroughCasesInSwitch` 开启，路径别名 `@/* → src/*`，`moduleResolution: "bundler"`
- **Rust**: 链接器 `rust-lld`，目标 `x86_64-pc-windows-msvc`
- **前端大 chunk**（想再瘦只能动这里）: mermaid 3.2MB、lowlight 1.15MB、codemirror 871KB

### Wiki-Link 系统（`src/wikilink/`）

Obsidian 风格的 `[[双向链接]]`：

| 模块        | 文件                            | 职责                                                            |
| --------- | ----------------------------- | ------------------------------------------------------------- |
| 解析器       | `LinkParser.ts`               | 正则匹配 `[[link]]` 和 `![[embed]]` 语法                             |
| 索引服务      | `LinkIndexService.ts`         | outlinks / backlinks 映射、文件名快速查找，支持全量重建与增量更新，可序列化跨窗口传输 |
| DOM 处理器   | `WikiLinkProcessor.ts`        | 将文本节点中的 `[[...]]` 转为可点击的样式化链接                                 |
| 代码段守卫     | `codeSpanGuard.ts`            | 避免代码块 / 行内 code 内的 `[[...]]` 被误解析                              |
| TipTap 扩展 | `Editor/extensions/wiki-link.ts` | 编辑器内的 WikiLink Node 扩展                                       |
| 自动补全      | `WikiLinkAutocomplete.tsx`    | 监听 `wiki-link-trigger` 事件显示补全列表，通过 Selection API 替换文本          |
| 悬停预览      | `WikiLinkPreview.tsx`         | 鼠标悬停预览目标笔记内容                                                  |
| 反向链接面板    | `BacklinksPanel.tsx`          | 展示当前文件的反向链接和出链                                                |

索引持久化于 `zmd-link-index` / `zmd-index-vault`。

### 发布功能（`src/publish/`）

将 Vault 中的 Markdown 发布为静态网站：

| 模块      | 文件                              | 职责                                          |
| ------- | ------------------------------- | ------------------------------------------- |
| 发布面板    | `PublishPanel.tsx`              | 发布操作覆盖面板                                    |
| 发布设置    | `PublishSettings.tsx`           | 发布配置表单                                      |
| 配置对话框   | `PublishConfigDialog.tsx` / `PublishConfigFields.tsx` | 发布配置详情编辑                            |
| 发布服务    | `PublishService.ts`             | 加载/保存发布配置，调用 `run_markdown_publish` Rust 命令 |
| Rust 命令 | `run_markdown_publish`          | 调用 `@abstractwebunit/markdown-publish` CLI  |
| 预览      | `preview_site` / `stop_preview` | 启动/停止 Node.js HTTP 服务器预览发布结果                |

**打包体积约定**：安装包**不再随包分发** `markdown-publish`（其 `node_modules` 82MB，
会让 NSIS 从 6.6MB 涨到 21.4MB+）。生产环境依赖用户 `npm install -g @abstractwebunit/markdown-publish`。
Rust 侧 `find_markdown_publish_launcher` 三级查找：资源目录（仅兼容旧装）→
`vendor/node_modules`（开发）→ PATH 全局；全局命中时用 `global_cli_mjs()` 反解真实 `cli.mjs`。

### 文件监听系统

`services/useVaultWatcher.ts` — React Hook，在 Vault 切换时：

1. 调用 `watch_vault` Rust 命令启动 `notify` 文件系统监听
2. 防抖处理文件变更事件
3. 自动更新 LinkIndexService 的链接索引
4. 组件卸载或切换 Vault 时调用 `unwatch_vault` 停止监听

### 其他重要模块（`src/services/`、`src/components/`）

- **`components/FilePreview.tsx`** — 非 Markdown 文件预览：图片 / 视频 / 音频 / PDF（图片可缩放）
- **`components/CommandPalette.tsx`** — 命令面板（`zmd-recent-commands` 记忆最近使用）
- **`components/QuickOpen.tsx`** — 快速打开文件，支持"在新窗口打开"与"在分屏中打开"
- **`components/ConfirmDialog.tsx`** — 可复用确认对话框，支持 Y/N 键盘快捷键
- **`services/ImageManager.ts`** — 图片存储管理（vault-assets 固定目录）、文件名生成、路径工具
- **`services/Updater.ts`** — 封装 `@tauri-apps/plugin-updater`，提供检查/下载/安装/重启流程
- **`services/vault-file-scanner.ts`** — 仓库扫描（与 Rust `tydora-core` 的 `scan_vault` 语义对齐）

### 国际化（`src/i18n/`）

i18next + react-i18next，语言文件 `locales/zh-CN.json` / `locales/en-US.json`，
`LanguageContext.tsx` 提供切换，持久化于 `zmd-language`。
资源顶层键共 14 个：`settings`、`app`、`xhs`、`sidebar`、`editor`、`commandPalette`、
`quickOpen`、`canvas`、`filePreview`、`exportPreview`、`imageManager`、`publish`、
`mindmapWindow`、`vaultManager`。

## CI/CD

`.github/workflows/` 下 4 个工作流：

**`release.yml`** — 桌面端打包

- 触发: push 到 `release` 分支或手动 dispatch
- 跨平台矩阵: `windows-latest`、`macos-latest`（aarch64 + x86_64）、`ubuntu-22.04`
- 使用 `dtolnay/rust-toolchain@stable`、`swatinem/rust-cache@v2`、`tauri-apps/tauri-action@v0`
- 创建 Draft GitHub Release，用 `TAURI_SIGNING_PRIVATE_KEY` 签名；
  便携版步骤做双名探测（`tydora-desktop.exe` / `Tydora.exe`）并统一 zip 内命名为 `Tydora.exe`

**`release-please.yml`** — 版本与 CHANGELOG 自动化（配合 `release-please-config.json`）

**`msstore.yml`** — 微软商店 MSIX 提交（配合 `scripts/build-msix.ps1`、`msix/AppxManifest.xml`）

**`deploy-docs.yml`** — 文档站部署

- 触发: push 到 `main` 且变更涉及 `website/**`、`scripts/copy-landing.mjs`、
  `scripts/inject-analytics.mjs`、`package.json` 或本 workflow
- Node.js 22 + `npm ci` → `npm run docs:build`（**markdown-publish**，非 MkDocs）
- 产物目录 `website/site/`，经 `actions/upload-pages-artifact` 部署到 GitHub Pages

## CLI（tydora-cli）

> **2026-09-07 启动**：参考既有「Rust 原生二进制 + Tauri sidecar」范式，给 Tydora 加 CLI 和后续 MCP。
> 详见 `docs/cli-implementation-plan.md`。

### 位置

- 代码：`app/tydora-cli/`（独立 Cargo workspace 成员）
- 方案文档：`docs/cli-implementation-plan.md`
- 自包含文档：`app/tydora-cli/README.md`
- 复用层：`app/tydora-core/`（`error` / `frontmatter` / `note` / `vault`）

### 编译与运行

```bash
# 单 host release（默认目标）
cd app && cargo build --release --bin tydora-cli

# 单元 + 冒烟测试
cd app && cargo test --bin tydora-cli --test cli_smoke

# 通过 npm scripts
npm run cli:test
npm run cli:run -- --version
npm run build:cli              # = bash scripts/cli-build.sh
npm run build:cli:win          # Windows 包装版
```

### MSVC 环境小坑（仅 Windows）

这台机器装了 VS BuildTools 18 + Windows SDK 26100，但 MSVC bin 不在默认 PATH，
且 `PATH` 里的 `link` 实际是 Git Bash 自带的 GNU coreutils（不是 MSVC linker），
cargo 调 link 时报 "extra operand"。

已通过 `app/.cargo/config.toml` 把 linker 显式指向 MSVC link.exe，并提供
`scripts/cli-env.sh` 导出 `LIB` / `INCLUDE`：

```bash
eval "$(bash scripts/cli-env.sh)" && cd app && cargo build --bin tydora-cli
```

未来若要让 cargo 通过 vswhere 自动发现 MSVC，可移除此 work-around。

### Phase 进度

- ✅ **Phase 1**（只读地基）：notebooks / list / show + 4 档退出码 + Windows UTF-8 console + `--json`。14 个冒烟测试全过。
- ✅ **Phase 2**（写路径）：create / edit / write / delete + 原子写 + trash 回收 + `--dry-run` + `--new-stdin`。
  13 个新测试（共 27）。4 个 JSON schema：`tydora.create.v1` / `edit.v1` / `write.v1` / `delete.v1`。
  - trash 路径：`$TYDORA_HOME/trash/vaults/<vault-hash8>/<flat-id>-<unix-ts>.md`
    （`vault-hash8` = canonicalize(vault) 的 FNV-1a 哈希前 8 位 hex；
    `flat-id` 把 vault 相对路径中的 `/`、`\` 都换成 `_`；时间戳为秒级）
  - 所有 write / edit 都先写 `.md.tmp` 再 rename
  - `edit --old` 必须恰好出现 1 次；`--new` 与 `--new-stdin` 二选一必填
- ✅ **Phase 5**（`tydora-core` 抽离）：CLI `store.rs` 1054 → 772 行（-27%）。4 模块
  `error` / `frontmatter` / `note` / `vault`。**关键反转**：`src-tauri/` 里几乎没有可下沉业务，
  所以 seed 来自 CLI 的 Rust 重写。依赖严格 = std + serde + serde_json + thiserror
  （**不引入** serde_yaml，简化 YAML 子集与 `Editor/frontmatter.ts` 对齐）。
  `vault::scan_vault` 严格对齐 `services/vault-file-scanner.ts`（跳过 `.` 开头、
  单目录 IO 错误 swallow、16 个 IMAGE_EXTENSIONS 逐字一致）。
  25 个 core 单测 + 27 个 CLI 集成测试全过，二进制 1.4MB 不变。
- ✅ **Phase 6**（`src-tauri/` → `app/tydora-desktop/` 物理搬迁，2026-09-09）：
  统一 `app/` 工作区。关键经验：wry `[patch]` 必须放 workspace 根 `app/Cargo.toml`
  （成员级被忽略）；`tauri.conf.json` 的相对路径以配置文件所在目录为基准；
  Tauri CLI 的 `--config` 是 dev/build 子命令级参数。
- ⏳ **Phase 3**（进阶）：search / publish / completion + 构建脚本产物接入 Tauri
  `externalBin` + 桌面端 PATH 安装 + ≥30 天的 trash 自动清理
- ⏳ **Phase 4**（MCP）：`tydora mcp` + 受限 CLI 语法 + 唯一工具 `tydora_note`
- Linux 依赖: `libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`patchelf`、`libgtk-3-dev`

## Markdown 文档站（`website/`）

独立于应用的中英双语帮助文档站，用 `@abstractwebunit/markdown-publish` 构建。

- 源文件：`website/docs_zh/**/*.md`（中文） + `website/docs_en/**/*.md`（英文）
- **每语言各一份 config**（根目录那份 `website/markdown-publish.config.json` 实际未被 `docs:build` 使用）：
  - zh：`vaultDir=website/docs_zh`、`baseHref=/Tydora/`、`out=website/site`
  - en：`vaultDir=website/docs_en`、`baseHref=/Tydora/en/`、`out=website/site/en`
- `npm run docs:build` → `scripts/build-docs.mjs` → 依次跑两份 config；
  `postdocs:build` 再做 copy-landing + inject-analytics
- 文档中的 `[[相对路径/笔记名]]` 渲染为站内链接（**相对路径不含 `.md`**）；
  目录编号中英一一对应（如 `02-编辑器/11-Vim模式.md` ↔ `02-Editor/11-Vim-Mode.md`）
- `BASE_HREF` 环境变量可覆盖 baseHref（供 EdgeOne 根路径部署），构建后临时 config 自动删除
- `website/site/` 与 `vendor/markdown-publish/src/content` 均 gitignored，构建无 git 噪声

**本机构建坑**：

- safe-delete 会拦截 `vendor/markdown-publish/src/content` 的清空（>50 文件阈值），
  走 trash 会 ETIMEDOUT → 需 `CODEBUDDY_SAFE_DELETE_ENABLED=0`
- managed Node 22.22.2 低于 Angular CLI 要求的 ≥ 22.22.3
  → 必须 `PATH="/d/Programs/nodejs:$PATH"`（系统 Node 24.18.0）

## TipTap 编辑器架构

### 扩展列表

编辑器 `StarterKit` 几乎禁用了全部内置子扩展（只留 dropcursor / gapcursor 等），
每个格式扩展单独引入以便禁用内置快捷键、自定义输入规则：

| 扩展                                                                                                              | 用途                        |
| --------------------------------------------------------------------------------------------------------------- | ------------------------- |
| StarterKit（`paragraph`/`codeBlock`/`link`/`bold`/`italic`/`strike`/`code`/`blockquote`/列表/`heading`/`hardBreak` 全禁用） | 核心扩展集合（仅保留基础能力）           |
| Paragraph（自定义 `textAlign`）                                                                                      | 段落 / 对齐                   |
| Bold / Italic / Strike / Code                                                                                   | 行内格式（禁内置快捷键；输入规则去掉"行首或空白"前缀限制，行中也可即时渲染） |
| Blockquote / `BulletListExt` / OrderedList / ListItem                                                             | 块级格式（BulletList 带输入规则增强）   |
| `CodeBlockLowlightSafe`                                                                                         | 代码块（语法高亮 + 安全封装）           |
| TiptapImage / TiptapLink                                                                                        | 图片（inline / base64）/ 超链接  |
| Table / TableRow / TableCell / TableHeader                                                                      | 表格（resizable + 浮动工具栏）      |
| `TaskListExt` / `TaskItemExt`                                                                                   | 任务列表（输入规则增强）              |
| Highlight / Typography / Placeholder                                                                            | 高亮 / 排版优化 / 占位符            |
| Heading / HardBreak / Markdown (tiptap-markdown)                                                                | 标题 / 硬换行 / Markdown 序列化    |
| Frontmatter / StripStyle / HardBreakCleanup                                                                     | frontmatter 节点 / 去样式 / 硬换行清理 |
| Callout / Math / Mermaid / Tag / WikiLink                                                                       | 自定义块（提示框 / KaTeX / 图表 / 标签 / 双链） |
| SearchHighlight / HeadingHighlight / CodeBlockToolbar / TableFloatingToolbar / BulletListMindmap                | 结果高亮 / 标题高亮 / 代码块工具栏 / 表格工具栏 / 列表转导图 |
| Vim（`createTiptapVimExtensions`）                                                                                | Vim 模式（按配置启用）              |

### 自定义扩展文件（`Editor/extensions/`）

`wiki-link.ts`、`tag.ts`、`callout.ts`、`math.ts`、`mermaid.ts`、`mermaid-language.ts`、
`search-highlight.ts`、`heading-highlight.ts`、`code-block-toolbar.ts`、
`table-floating-toolbar.ts`、`custom-commands.ts`（命令分发）、`bullet-list-input.ts`、
`bullet-list-mindmap.ts`、`task-list-input.ts`、`hardbreak-cleanup.ts`、`strip-style.ts`、
`markdown-safe-url.ts`、`frontmatter.ts`、`code-block-lowlight-safe.ts`。

### Frontmatter 支持

- **`Editor/frontmatter.ts`** — YAML frontmatter 解析器，导出 `parseFrontmatter()`（严格模式）
  与 `extractFrontmatter()`（始终返回 `{ frontmatter, body }`），支持引号字符串、数组、
  布尔值、数字、null 与多行值
- **`Editor/extensions/frontmatter.ts`** — 编辑器内的 frontmatter 节点扩展（把 YAML 块作为
  独立节点渲染与编辑）
- 该解析器的语义与 Rust `tydora-core` 的 `frontmatter` 模块对齐（同属"简化 YAML 子集"，不引入 serde_yaml）

### 源码编辑器

**`Editor/SourceEditor.tsx`** + **`Editor/CodeMirrorEditor.tsx`** — CodeMirror 6：
`@codemirror/lang-markdown` 语法、自定义行号、搜索高亮、主题适配；
`Editor/markdown-position-map.ts` 提供 Markdown 偏移 ↔ ProseMirror 位置的映射
（Vim 与查找替换在两种模式间切换依赖它）。

## 主题/样式文件（相对 `app/tydora-web/src/`）

- `themes.css` / `global.css` — 主题 CSS 变量定义与全局样式
- `Editor/theme.css` — TipTap 编辑器、代码块工具栏、右键菜单、源码编辑器样式
- `Sidebar.css` / `App.css` — 侧栏 / 主布局（含左右侧栏、分屏 pane）
- `Settings.css` — 设置面板
- `tags/Tag.css`、`tags/TagAutocomplete.css`、`tags/TagPanel.css` — 标签样式
- `wikilink/WikiLink.css`、`WikiLinkAutocomplete.css`、`WikiLinkPreview.css`、`BacklinksPanel.css`
- `graph/*.css`、`mindmap/*.css` — 图谱 / 思维导图（视图 + 独立窗口）
- `publish/PublishPanel.css`、`publish/PublishConfigDialog.css`
- `Canvas/canvas.css`、`Terminal/Terminal.css`
- `components/*.css` — 文件预览、导出预览、查找替换、设置下拉等

## 重要开发规则

### 1. 程序化修改编辑器内容后必须同步 React 状态

TipTap 的 `commands.setContent()` 内部会触发 `onUpdate` 回调。但通过 `isInternalRef` 标志可以区分程序化变更和用户输入：

```typescript
// TipTapEditor.tsx — onUpdate 回调
onUpdate: ({ editor: ed }) => {
    if (isInternalRef.current) {     // ← 程序化 setContent 后会置为 true
        isInternalRef.current = false;
        return;                      // ← 直接返回，不调用 onChange！
    }
    const md = (ed.storage as any).markdown.getMarkdown();
    onChangeRef.current(md);
}
```

**正确做法**：程序化修改内容后，设置 `isInternalRef.current = true` 再调用 `setContent`：

```typescript
// ✅ 正确
isInternalRef.current = true;
editor.commands.setContent(val);

// ❌ 错误 — 可能触发 onChange 导致循环
editor.commands.setContent(val);
```

### 2. TipTap 扩展注册规则

- Tiptap 不允许两个扩展有相同的 `name` 属性。如果自定义扩展与内置扩展同名，需要先禁用内置版本。
- `StarterKit` 包含多个子扩展，可以通过 `configure({ extensionName: false })` 禁用特定子扩展。
- 扩展的 `addProseMirrorPlugins()` 在 `bindEditor` 之后调用，此时 `this.editor` 已就绪。

### 3. Markdown 序列化

使用 `tiptap-markdown` 扩展进行 Markdown ↔ HTML 转换：

```typescript
// 获取 Markdown
const md = (editor.storage as any).markdown.getMarkdown();

// 设置内容（HTML 或 Markdown）
editor.commands.setContent(htmlOrMarkdown);
```

### 4. 快捷键系统

项目使用自定义快捷键系统：默认表在 `src/config/shortcuts.json`，
运行时由 `Editor/shortcuts.ts` 的 `loadShortcuts()` / `matchShortcut()` 读取用户覆盖（`zmd-shortcuts`）。
快捷键 ID 到命令的映射在 `Editor/TipTapEditor.tsx` 的 `commandMap` 中定义。
标题快捷键为 `Ctrl+1~6`（**不是** `Ctrl+Alt+1~6`）。

### 5. WikiLink 自动补全

`WikiLinkAutocomplete` 组件监听 `wiki-link-trigger` 自定义事件，显示自动补全列表。
选中后通过 Selection API 直接替换文本，避免 `setValue` 滚动到顶部。

### 6. 白板 / 画布路径必须使用相对路径

在白板（Canvas）功能中，所有文件路径必须使用**相对路径**（相对于 Vault 根目录），不能使用绝对路径。

**原因**：绝对路径在不同机器上无法使用；移动画布文件后路径会失效；需要与 Obsidian 保持兼容。

```typescript
// 保存时：转换为相对路径
function toRelativePath(absolutePath: string, vaultPath: string): string {
  if (!vaultPath || !absolutePath) return absolutePath;
  const normalizedAbsolute = absolutePath.replace(/\\/g, '/');
  const normalizedVault = vaultPath.replace(/\\/g, '/');
  if (normalizedAbsolute.startsWith(normalizedVault)) {
    let relative = normalizedAbsolute.slice(normalizedVault.length);
    if (relative.startsWith('/')) relative = relative.slice(1);
    return relative;
  }
  return absolutePath;
}

// 加载时：转换为绝对路径
function resolveFilePath(basePath: string, relativePath: string): string {
  // 将相对路径解析为绝对路径
}
```

**使用场景**：插入笔记卡片（.md）、媒体文件（图片/视频/音频/PDF）、白板文件（.canvas）、粘贴图片。

### 7. macOS 窗口圆角与选区

macOS 透明窗口圆角用 CSS `clip-path: inset(0 round 12px)`（见 `global.css`），**不要**再用
`#root` 的 `overflow` + `border-radius`，也**不要**对承载 WKWebView 的 contentView 设
`CALayer.masksToBounds`——二者都会留下幽灵选区高亮。非 macOS 仍可用 `#root` 的 CSS overflow 裁剪。
编辑器内右键需在捕获阶段 `preventDefault(mousedown button=2)`，否则 WebKit 会先选中单词。

## 已知问题与经验教训

### 1. Tiptap v3 + React 19 兼容性问题

**问题**：`@tiptap/extensions` v3.27.1 的 Focus 扩展在 `decorations` prop 中访问
`this.editor.isEditable`，但在 React 19 的渲染时序下，`this.editor` 可能为 undefined。

**错误信息**：

```
TypeError: Cannot destructure property 'isEditable' of 'editor' as it is undefined.
    at Plugin.apply (state.ts:71:15)
```

**根因**：`@tiptap/extension-placeholder` 通过 re-export 引入了 `@tiptap/extensions` 的 barrel export，
导致 Focus 扩展被打包进项目。

**解决方案**：`scripts/patch-tiptap-focus.mjs` 直接改写
`node_modules/@tiptap/extensions/dist/index.js`，给 `decorations` / `buildPlaceholderDecorations`
等访问 `this.editor` 的位置加 `if (!this.editor) return ...` 守卫。
**注意**：该脚本**未接入** `postinstall`（`postinstall` 只跑 `patch-package`，
`patches/` 下目前只有 `tiptap-markdown+0.9.0.patch`），所以重装依赖后需手动执行一次，
否则 Focus 扩展的崩溃会复现。

**教训**：

- 不要直接 patch `node_modules` 文件，Vite 的预构建缓存会覆盖修改
- Barrel export（`export * from ...`）会将整个模块树拉入 bundle，即使只使用其中一个导出
- 应使用 `patch-package` 等工具进行持久化 patch

### 2. Vite 预构建缓存

**问题**：Vite dev 模式会预构建依赖并缓存在 `node_modules/.vite`。直接修改 `node_modules`
中的文件不会被 Vite 加载。

**解决方案**：用 `patch-package` 生成 diff 并在 `npm install` 后自动应用；
或用 `resolve.alias` 把有问题的模块重定向到本地修复版。

### 3. TipTap 扩展同名覆盖不可靠

**问题**：尝试用同名扩展（如 `SafeFocus`）覆盖有 bug 的 Focus 扩展，但 Tiptap
ExtensionManager 不做去重，两个同名扩展的插件都会被注册。

**教训**：Tiptap 不支持同名扩展覆盖，需要从源头修复或使用 Vite alias。

### 4. ProseMirror 插件内部错误无法拦截

**问题**：错误发生在 ProseMirror 的 `Plugin.apply` → `EditorState.applyInner` 调用链中，
上层的 try-catch 无法拦截。

**教训**：ProseMirror 插件内部的错误需要在插件层面修复，不能依赖上层防御性代码。

### 5. React 19 渲染时序

**问题**：React 19 的渲染模式与 Tiptap v3 的编辑器初始化存在时序差异。

**建议**：使用 `immediatelyRender: false` 让编辑器在 `useEffect` 中创建，避免首帧渲染的竞态条件。

### 6. 大文件导出的堆损坏

**问题**：一次性把大文件写入导致堆损坏（历史 bug）。

**方案**：Rust 侧拆成 `create_export_file`（创建/截断）+ `append_export_file`（分块追加）两步。
前端导出流程必须走这两步，不要再用单次写。

### 7. TipTap InputRule 不能用 `^` 锚点（Markdown 链接不在段落开头就失效）

**问题**：`[文本](url)` 在段落**中间**（前面已有文字）输入时不转成链接，退化成纯文本；
切到源码模式看到方括号被转义：`\[文本\](url)`。

**根因**：InputRule 把「段落开头 → 光标」之间的整段文本交给 `find` 匹配
（`@tiptap/core` 的 `getTextContentFromNodes($from) + text`）。所以正则里加 `^`
等于要求链接必须是整段内容，**只有空段落里才生效**。
`markInputRule` 的 range 计算用的是 `match[0].length`（不是 `match.index`），
因此只要 `match[0]` 恰好是 `[文本](url)` 本身，段落中间也能正确定位，无需 `^` 锚点。

**修正**（`Editor/TipTapEditor.tsx` 的 Link `addInputRules`）：

```ts
// ❌ 只能空段落生效
find: /^\[([^\]]+)\]\((?:[^)\s]+)\)$/
// ✅ 段落中间同样生效；排除前置 ! / \ 
find: /(?<![!\\])\[([^\]]+)\]\((?:[^)\s]+)\)$/
```

前置 `!` 必须排除：Link 的 `priority: 1000` 高于 Image 的 `100`，本规则会**先于**
Image 的 `nodeInputRule` 执行，不排除就会把 `![alt](url)` 抢成「一个 `!` + 链接」。
项目里 Bold/Italic 的规则（`(?<!\*)...`）用的也是同款 lookbehind 写法。

**附带风险**：点链接会在 IR 模式下把链接换成字面量 `[文本](url)` 供编辑
（`convertLinkToSource`），此时文档里是**纯文本 + 无 mark**，`getMarkdown()` 会把
方括号转义成 `\[ \]`。若自动保存（默认开，1s 防抖）在这段「编辑中」状态触发，
磁盘上就会写入转义版本。修 Link 正则**不能**解决这条路径。

## 文件结构速查

> 全部前端源码位于 `app/tydora-web/src/`（2026-09-09 由仓库根 `src/` 整体搬入）。

```
app/tydora-web/src/
├── App.tsx                        # 应用主组件（状态中心、分屏 pane、文件打开流程）
├── App.css                        # 主布局样式
├── Settings.tsx                   # 设置面板（11 个页签 + SidebarTab 类型定义）
├── Sidebar.tsx                    # 侧栏（files/search/outline/bookmarks/tags，可左右分置）
├── Sidebar.css
├── main.tsx                       # 唯一入口，按 ?window= 懒加载各窗口
├── boot-timing.ts                 # 启动耗时打点
├── analytics.ts
├── themes/
│   ├── ThemeManager.ts            # 10 种内置主题
│   ├── CustomThemeManager.ts      # 自定义主题
│   ├── ThemeContext.tsx           # 主题 Context
│   ├── themeTokens.ts / themePack.ts / appearance.ts
│   ├── codeThemes.ts              # 11 种代码配色
│   ├── codeThemeTokens.ts / colorUtils.ts
│   ├── ThemeColorField.tsx / ThemeSizeField.tsx
│   └── index.ts
├── Editor/
│   ├── TipTapEditor.tsx           # TipTap 主组件（扩展注册、commandMap、Vim 接入）
│   ├── SourceEditor.tsx           # CodeMirror 源码编辑器
│   ├── CodeMirrorEditor.tsx       # CodeMirror 核心封装
│   ├── markdown-position-map.ts   # MD 偏移 ↔ PM 位置映射
│   ├── ContextMenu.tsx / LinkDialog.tsx / MathDialog.tsx
│   ├── TableFloatingToolbar.tsx
│   ├── frontmatter.ts / shortcuts.ts / types.ts / theme.css / index.tsx
│   ├── extra-lowlight-languages.ts
│   └── extensions/                # 自定义 TipTap 扩展（见上文清单）
├── wikilink/
│   ├── LinkParser.ts / LinkIndexService.ts / WikiLinkProcessor.ts / codeSpanGuard.ts
│   ├── WikiLinkAutocomplete.tsx / WikiLinkPreview.tsx / BacklinksPanel.tsx
│   └── *.css / index.ts
├── tags/
│   ├── TagIndexService.ts / tagSearch.ts / TagAutocomplete.tsx / TagPanel.tsx
│   └── *.css / index.ts
├── Bookmarks/
│   ├── BookmarksService.ts / BookmarksPanel.tsx / BookmarkDialog.tsx / index.ts
├── graph/
│   ├── GraphView.tsx / GraphCanvas.tsx / LocalGraph.tsx / GraphWindow.tsx / index.ts
├── mindmap/
│   ├── MindmapView.tsx / MindmapWindow.tsx / index.ts
├── Canvas/
│   ├── CanvasView.tsx / CanvasWindow.tsx / CanvasToolbar.tsx / CanvasContextMenu.tsx
│   ├── canvas-store.ts (Zustand) / canvas-utils.ts / canvas-settings.ts / CanvasSettings.tsx
│   ├── AlignmentGuides.tsx / AlignmentToolbar.tsx / NodeToolbar.tsx / UndoRedoPanel.tsx
│   ├── NotePicker.tsx / MediaPicker.tsx / ColorPicker.tsx / useNearestEdge.ts
│   ├── nodes/                     # TextNode / FileNode / NoteNode / MediaNode / CanvasNode
│   │                              # UrlNode / ImageNode / GroupNode
│   ├── edges/CanvasEdge.tsx
│   └── canvas.css
├── Terminal/
│   ├── TerminalView.tsx / TerminalSearch.tsx / TerminalSettingsContent.tsx
│   ├── TerminalContextMenu.tsx / terminal-settings.ts / terminalApi.ts
│   └── oscTitleParser.ts / Terminal.css
├── vim/
│   ├── VimProvider.tsx / types.ts / index.ts
│   ├── config/                    # leader / prefixG / prefixM / prefixT / prefixZ / conflictKeys
│   ├── tiptap/tiptapVimExtension.ts
│   ├── codemirror/vimExtension.ts / markdownActions.ts
│   ├── panes/PaneNavigator.ts / types.ts
│   ├── filetree / navigation / settings
├── export/
│   ├── exporters.ts               # buildHtmlDoc / exportPdfBytes / renderToPng / buildWechatHtml
│   ├── docx.ts / dom.ts / index.ts
│   └── xiaohongshu/               # 小红书图文（XhsPreviewPanel / paginate / render / themes / fonts / save）
├── publish/
│   ├── PublishPanel.tsx / PublishSettings.tsx / PublishService.ts
│   ├── PublishConfigDialog.tsx / PublishConfigFields.tsx / *.css / index.ts
├── VaultManager/
│   ├── VaultManagerWindow.tsx / VaultManager.css
├── components/
│   ├── CommandPalette.tsx / QuickOpen.tsx / ConfirmDialog.tsx
│   ├── FilePreview.tsx / ExportPreviewDialog.tsx / FindReplaceDialog.tsx
│   ├── FolderPicker.tsx / FontPicker.tsx / SettingsSelect.tsx / UpdateLinkDialog.tsx
│   ├── *.css / index.ts
├── services/
│   ├── ImageManager.ts / Updater.ts / index-builder.ts
│   ├── vault-file-scanner.ts / useVaultWatcher.ts / windowState.ts / index.ts
├── hooks/useDebounce.ts
├── config/shortcuts.json
├── i18n/                          # LanguageContext.tsx / index.ts / locales/{zh-CN,en-US}.json
├── utils/                         # menuDensity.ts / systemFonts.ts
├── analytics/ConsentDialog.tsx
├── assets/
└── global.css / themes.css

app/tydora-desktop/                # Tauri 桌面端 crate（原 src-tauri/）
├── Cargo.toml                     # package = tydora-desktop, lib = tydora_lib
├── tauri.conf.json                # identifier = com.tydora.editor
├── capabilities/default.json
├── msix/AppxManifest.xml
├── icons/  vendor/
└── src/
    ├── main.rs / lib.rs
    └── commands/                  # file / font / proxy / remote_image / terminal / watcher

app/tydora-core/                   # 业务复用层（error / frontmatter / note / vault）
app/tydora-cli/                    # CLI 二进制 crate
app/Cargo.toml                     # workspace 根（含 wry [patch]）
app/.cargo/config.toml             # linker = MSVC, target-dir = ../target
target/                            # 全部 cargo 产物（仓库根）
```
