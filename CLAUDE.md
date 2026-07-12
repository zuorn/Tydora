# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Tydora（代码内称为 "zmd"）是一个基于 Tauri v2 + React 19 的桌面 Markdown 编辑器。支持 WYSIWYG 和源码两种编辑模式，以及基于"仓库（Vault）"概念的文件管理。

## 技术栈

- **前端**: React 19 + TypeScript + Vite 6
- **后端**: Rust (Tauri v2)，Windows 为主要目标平台
- **编辑器**: TipTap 3.x（WYSIWYG 模式）+ CodeMirror 6（源码模式）+ tiptap-markdown（Markdown 序列化）
- **Tauri 插件**: `plugin-fs`（文件系统）、`plugin-dialog`（系统对话框）

## 常用命令

```bash
# 安装依赖
npm install

# 开发模式（Vite dev server，端口 1420）
npm run dev

# 构建前端（TypeScript 编译 + Vite 打包）
npm run build

# 预览生产构建（vite preview）
npm run preview

# 启动 Tauri（桌面应用）— 通过 scripts/run-tauri.mjs 加载 .env 签名密钥
npm run tauri

# 文档站点
npm run docs:build    # 构建 MkDocs 文档站点
npm run docs:serve    # 本地预览文档站点
npm run docs:clean    # 清理构建的文档
```

**注意**：项目目前没有配置 test/lint/format 脚本。`npm run build` 内置了 `tsc` 类型检查。`scripts/run-tauri.mjs` 用于加载 `.env` 文件中的签名密钥环境变量，然后转发参数给 `npx tauri`。

## 架构概览

### 前端 (src/)

**入口**: `main.tsx` → 用 `ThemeProvider` 包裹整个应用，挂载到 `#root`。

**主题系统**:
- `ThemeManager.ts` — 8 种内置主题定义（`white`、`mint`、`mint-dark`、`liquid-glass`、`claude-code`、`purple`、`hermes`、`next`）。默认主题为 `mint`。
- `CustomThemeManager.ts` — 自定义主题的导入/导出/管理，存储在 Tauri `appDataDir` 中。
- `codeThemes.ts` — 11 种代码语法高亮配色方案。
- `themes.tsx` 提供 `ThemeContext`，主题通过 `document.documentElement.dataset.theme` 设置，并在切换时同步更新 highlight.js 代码高亮样式。

**App 组件** (`App.tsx`) — 应用状态中心：
- 管理编辑器内容 (`content`)、当前文件路径 (`fileName`)、修改状态 (`modified`)、编辑模式 (`viewMode: "ir" | "sv"`)
- 管理仓库列表 (`vaults`)、当前激活仓库索引 (`activeVaultIndex`)、侧栏状态 (`sidebarOpen`/`sidebarWidth`)
- 所有状态持久化到 `localStorage`：`zmd-vaults`、`zmd-active-vault`、`zmd-sidebar-width`、`zmd-window-state`、`zmd-theme`
- 窗口位置/大小通过 Tauri Window API 恢复和防抖保存
- 自定义窗口控件（最小化/最大化/关闭），替代系统原生标题栏
- Ctrl+S 全局快捷键保存
- `EditorErrorBoundary` 类组件防止编辑器崩溃导致白屏

**TipTapEditor** (`src/Editor/TipTapEditor.tsx`) — TipTap 封装：
- 使用 `forwardRef` + `useImperativeHandle` 暴露 `getValue`/`setValue`/`resize`/`executeCommand` 等方法
- 通过内部标志 `isInternalRef` 区分程序化变更和用户输入，避免 `setValue` 后触发 `onChange` 造成循环
- 使用 `tiptap-markdown` 进行 Markdown ↔ HTML 双向转换
- 通过 `useEditor` hook 创建编辑器实例，配置 20+ 扩展
- 支持两种模式：IR（即时渲染/WYSIWYG）和 SV（源码模式，使用 CodeMirror）

**SourceEditor** (`src/Editor/SourceEditor.tsx`) — CodeMirror 6 源码编辑器：
- 使用 `@codemirror/lang-markdown` 提供 Markdown 语法支持
- 自定义行号显示、搜索高亮、主题适配

**Sidebar** (`Sidebar.tsx`) — 包含三个子模块：
1. **FileTree**: 递归树形组件，渲染仓库目录文件结构。支持展开/折叠目录、右键菜单（新建文件/文件夹、重命名、删除、复制路径）、内联重命名、拖拽移动文件到其他目录。
2. **Outline**: 解析 Markdown 标题（`# ~ ######`），渲染可点击的大纲列表，点击滚动到编辑器对应位置。
3. **VaultSwitcher**: 底部仓库选择器，含仓库列表下拉菜单和主题选择设置弹出面板。

**Vault 概念**：用户选择一个本地文件夹作为"仓库"，应用展示该文件夹内的文件树。支持多仓库切换，仓库列表持久化到 localStorage。

### 后端 (src-tauri/)

**入口**: `main.rs` → 调用 `tydora_lib::run()`

**源码结构**:
```
src-tauri/src/
├── main.rs
├── lib.rs
└── commands/
    ├── mod.rs
    └── watcher_commands.rs    # 文件监听命令（notify crate）
```

**Tauri 插件**（5 个）:
| 插件 | 用途 |
|------|------|
| `tauri-plugin-fs` | 文件系统访问 |
| `tauri-plugin-dialog` | 系统对话框 |
| `tauri-plugin-window-state` | 窗口状态持久化 |
| `tauri-plugin-updater` | 应用自动更新 |
| `tauri-plugin-process` | 进程管理 |

**自定义 Tauri 命令**（15 个）:
| 命令 | 用途 |
|------|------|
| `get_default_content` | 获取默认编辑器内容 |
| `get_app_version` | 获取应用版本号 |
| `get_cwd` | 获取当前工作目录 |
| `open_settings_window` | 打开设置窗口（800×600，无装饰） |
| `open_file_in_new_window` | 在新窗口打开文件（1200×800） |
| `open_file_location` | 在系统文件管理器中定位文件 |
| `open_file` | 用系统默认应用打开文件 |
| `open_directory` | 在系统文件管理器中打开目录 |
| `open_mindmap_window` | 打开思维导图窗口（900×600） |
| `open_graph_window` | 打开知识图谱窗口（1000×700） |
| `watch_vault` | 启动仓库文件系统监听 |
| `unwatch_vault` | 停止仓库文件系统监听 |
| `run_markdown_publish` | 调用 `@abstractwebunit/markdown-publish` CLI 发布网站 |
| `preview_site` | 启动 HTTP 服务器预览已发布站点 |
| `stop_preview` | 停止预览 HTTP 服务器 |

**状态管理**（lib.rs）:
- `WatcherState` (`Mutex<Option<RecommendedWatcher>>`) — 仓库文件监听状态
- `PreviewServer` (`Mutex<Option<Child>>`) — 预览 HTTP 服务器子进程

**其他**:
- `register_uri_scheme_protocol("local-file", ...)` — 自定义 URI scheme，用于加载本地文件
- Debug 模式下自动打开 DevTools
- `windows_subsystem = "windows"` 防止 release 模式出现控制台窗口

**Rust 依赖**: `serde`/`serde_json`（序列化）、`notify`（文件系统监听）、三个 Tauri 插件 crate。

### 多窗口架构

Tydora 采用多窗口架构，主进程通过 Tauri Window API 管理多个独立窗口：

| 窗口 | 触发方式 | 默认大小 | 说明 |
|------|----------|----------|------|
| 主窗口 | 应用启动 | 1200×800 | 编辑器、侧栏等核心 UI |
| 设置窗口 | `open_settings_window` | 800×600 | 独立设置面板（无装饰） |
| 文件窗口 | `open_file_in_new_window` | 1200×800 | 在独立窗口中编辑文件 |
| 图谱窗口 | `open_graph_window` | 1000×700 | 知识图谱可视化 |
| 思维导图窗口 | `open_mindmap_window` | 900×600 | 思维导图可视化 |

各独立窗口（如 GraphWindow、MindmapWindow）渲染各自的 React 组件树，通过序列化的 JSON 数据（如 LinkIndexService 序列化的链接索引）与主窗口共享状态。

### Tauri 配置 (tauri.conf.json)

- **标识符**: `com.tydora.editor`，版本 `0.0.5`
- **窗口**: 1200×800，居中，无装饰，可调整大小
- **打包**: Windows (NSIS)、macOS (DMG)、Linux (AppImage)
- **CSP**: 设为 `null`（允许加载本地资源）
- **自动更新**: 配置了公钥签名验证，端点指向 GitHub Releases
- **beforeDevCommand**: `npm run dev`，**beforeBuildCommand**: `npm run build`
- **capabilities** (`src-tauri/capabilities/default.json`): 授予文件系统全路径读写、窗口控制、对话框、更新器、进程管理权限

### 构建配置

- **Vite** (`vite.config.ts`): `@vitejs/plugin-react`，端口 1420 严格模式，`clearScreen: false`（避免覆盖 Rust 编译错误），忽略 `src-tauri/` 的文件监听
- **TypeScript**: target ES2020，严格模式，`noUnusedLocals`/`noUnusedParameters`/`noFallthroughCasesInSwitch` 开启，路径别名 `@/* → src/*`，`moduleResolution: "bundler"`
- **Rust**: 链接器 `rust-lld`，目标 `x86_64-pc-windows-msvc`

### Wiki-Link 系统

Obsidian 风格的 `[[双向链接]]` 由三个模块协作实现：

| 模块 | 文件 | 职责 |
|------|------|------|
| 解析器 | `LinkParser.ts` | 正则匹配 `[[link]]` 和 `![[embed]]` 语法 |
| 索引服务 | `LinkIndexService.ts` | 维护 outlinks/backlinks 映射、文件名快速查找，支持全量重建和增量更新，可序列化为 JSON 跨窗口传输 |
| DOM 处理器 | `WikiLinkProcessor.ts` | 将文本节点中的 `[[...]]` 转换为可点击的样式化链接 |
| TipTap 扩展 | `extensions/wiki-link.ts` | 编辑器内的 WikiLink Node 扩展 |
| 自动补全 | `WikiLinkAutocomplete.tsx` | 监听 `wiki-link-trigger` 事件显示补全列表，通过 Selection API 替换文本 |
| 反向链接面板 | `BacklinksPanel.tsx` | 展示当前文件的反向链接和出链 |

### 发布功能

将 Vault 中的 Markdown 文件发布为静态网站：

| 模块 | 文件 | 职责 |
|------|------|------|
| 发布面板 | `PublishPanel.tsx` | 发布操作覆盖面板 |
| 发布设置 | `PublishSettings.tsx` | 发布配置表单 |
| 发布服务 | `PublishService.ts` | 加载/保存发布配置，调用 `run_markdown_publish` Rust 命令 |
| Rust 命令 | `run_markdown_publish` | 调用 `@abstractwebunit/markdown-publish` CLI |
| 预览 | `preview_site` / `stop_preview` | 启动/停止 Node.js HTTP 服务器预览发布结果 |

### 文件监听系统

`useVaultWatcher.ts` — React Hook，在 Vault 切换时：
1. 调用 `watch_vault` Rust 命令启动 `notify` crate 文件系统监听
2. 防抖处理文件变更事件
3. 自动更新 LinkIndexService 的链接索引
4. 组件卸载或切换 Vault 时调用 `unwatch_vault` 停止监听

### 其他重要模块

- **`FilePreview.tsx`** — 非 Markdown 文件预览（图片、视频、音频、PDF），支持缩放
- **`ConfirmDialog.tsx`** — 可复用确认对话框，支持 Y/N 键盘快捷键
- **`ImageManager.ts`** — 图片存储管理（vault-assets 固定目录）、文件名生成、路径工具
- **`Updater.ts`** — 封装 `@tauri-apps/plugin-updater`，提供检查/下载/安装/重启流程

## CI/CD

### GitHub Actions

**`.github/workflows/release.yml`**:
- 触发: push 到 `release` 分支或手动 dispatch
- 跨平台构建矩阵: `windows-latest`、`macos-latest` (aarch64 + x86_64)、`ubuntu-22.04`
- 使用 `dtolnay/rust-toolchain@stable`、`swatinem/rust-cache@v2`、`tauri-apps/tauri-action@v0`
- 创建 Draft GitHub Release，使用 `TAURI_SIGNING_PRIVATE_KEY` 进行代码签名
- Linux 依赖: `libwebkit2gtk-4.1-dev`、`libappindicator3-dev`、`librsvg2-dev`、`patchelf`、`libgtk-3-dev`

**`.github/workflows/deploy-docs.yml`**:
- 触发: push 到 `main` 且变更涉及 `website/` 目录下的文档文件
- 使用 Python 3.12 构建 MkDocs 站点，部署到 GitHub Pages

## TipTap 编辑器架构

### 扩展列表

编辑器使用以下 TipTap 扩展：

| 扩展 | 用途 |
|------|------|
| StarterKit | 核心扩展集合（已禁用部分以单独配置） |
| Bold/Italic/Strike/Code | 行内格式（禁用了内置快捷键，使用自定义快捷键系统） |
| Blockquote/BulletList/OrderedList/ListItem | 块级格式 |
| CodeBlockLowlight | 代码块（带语法高亮） |
| Image | 图片（支持 inline、base64） |
| Link | 超链接 |
| Table/TableRow/TableCell/TableHeader | 表格（支持 resizable） |
| TaskList/TaskItem | 任务列表 |
| Highlight | 高亮 |
| Typography | 排版优化 |
| Placeholder | 占位符文本 |
| Markdown (tiptap-markdown) | Markdown 序列化 |

### 自定义扩展

| 文件 | 用途 |
|------|------|
| `extensions/wiki-link.ts` | Obsidian 风格的 `[[wiki-link]]` 支持 |
| `extensions/search-highlight.ts` | 搜索结果高亮 |
| `extensions/code-block-toolbar.ts` | 代码块工具栏（语言选择、复制、删除、折叠） |
| `extensions/custom-commands.ts` | 命令分发（根据命令名调用对应编辑器操作） |

### 待实现的扩展（备份在 `.mimocode/backup-extensions/`）

以下扩展已开发但因 Tiptap v3 兼容性问题暂未集成：

| 文件 | 用途 | 状态 |
|------|------|------|
| `slash-command.ts` | Slash 命令菜单（`/` 触发） | 代码完成，待集成 |
| `slash-command-view.ts` | Slash 菜单 tippy.js 定位渲染器 | 代码完成，待集成 |
| `SlashCommandMenu.tsx` | Slash 菜单 React 组件 | 代码完成，待集成 |
| `slash-command.css` | Slash 菜单样式 | 代码完成，待集成 |
| `selection-toolbar.ts` | 选中文本浮动工具栏 | 代码完成，待集成 |
| `drag-handle.ts` | 拖拽手柄（自定义实现） | 代码完成，待集成 |
| `safe-focus.ts` | SafeFocus 扩展（替代有 bug 的 Focus 扩展） | 代码完成，待集成 |

### Frontmatter 支持

- **`src/Editor/frontmatter.ts`**: YAML frontmatter 解析器 — 导出 `parseFrontmatter()`（严格模式）和 `extractFrontmatter()`（始终返回 `{ frontmatter, body }`），支持引号字符串、数组、布尔值、数字、null 和多行值。
- **`src/Editor/PropertiesPanel.tsx`**: 可折叠的 YAML 属性面板，显示排序后的 frontmatter 键值（title/tags/date 等优先），支持一键复制 YAML 块，复用代码块工具栏样式。

## 主题/样式文件

- `src/themes.css` — CSS 变量定义 8 种主题的颜色方案
- `src/App.css` — 主布局（app、main-container、editor-container、顶部/底部栏、窗口控件）
- `src/Sidebar.css` — 侧栏/文件树/右键菜单样式
- `src/Editor/theme.css` — TipTap 编辑器样式、代码块工具栏、右键菜单、源码编辑器样式
- `src/Settings.css` — 设置/发布设置面板样式
- `src/PublishPanel.css` — 发布面板样式
- `src/GraphView.css` / `src/MindmapView.css` — 图谱/思维导图样式
- `src/GraphWindow.css` / `src/MindmapWindow.css` — 图谱/思维导图独立窗口样式
- `src/BacklinksPanel.css` / `src/FilePreview.css` — 反向链接/文件预览样式
- `src/WikiLink.css` / `src/WikiLinkAutocomplete.css` — WikiLink 样式

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

项目使用自定义快捷键系统（`src/Editor/shortcuts.ts`），从 `localStorage` 读取用户配置。快捷键 ID 到命令的映射在 `TipTapEditor.tsx` 的 `commandMap` 中定义。

### 5. WikiLink 自动补全

`WikiLinkAutocomplete` 组件监听 `wiki-link-trigger` 自定义事件，显示自动补全列表。选中后通过 Selection API 直接替换文本，避免 `setValue` 滚动到顶部。

## 已知问题与经验教训

### 1. Tiptap v3 + React 19 兼容性问题

**问题**：`@tiptap/extensions` v3.27.1 的 Focus 扩展在 `decorations` prop 中访问 `this.editor.isEditable`，但在 React 19 的渲染时序下，`this.editor` 可能为 undefined。

**错误信息**：
```
TypeError: Cannot destructure property 'isEditable' of 'editor' as it is undefined.
    at Plugin.apply (state.ts:71:15)
```

**根因**：`@tiptap/extension-placeholder` 通过 re-export 引入了 `@tiptap/extensions` 的 barrel export，导致 Focus 扩展被打包进项目。

**解决方案（待实施）**：
- 使用 `patch-package` 对 `@tiptap/extensions` 打持久化补丁
- 或改用子模块路径导入：`import { Placeholder } from "@tiptap/extensions/placeholder"`

**教训**：
- 不要直接 patch `node_modules` 文件，Vite 的预构建缓存会覆盖修改
- Barrel export（`export * from ...`）会将整个模块树拉入 bundle，即使只使用其中一个导出
- 应使用 `patch-package` 等工具进行持久化 patch

### 2. Vite 预构建缓存

**问题**：Vite dev 模式会预构建依赖并缓存在 `node_modules/.vite`。直接修改 `node_modules` 中的文件不会被 Vite 加载。

**解决方案**：
- 使用 `patch-package` 生成 diff 文件，在 `npm install` 后自动应用
- 或使用 `resolve.alias` 将有问题的模块重定向到本地修复版

### 3. TipTap 扩展同名覆盖不可靠

**问题**：尝试用同名扩展（如 `SafeFocus`）覆盖有 bug 的 Focus 扩展，但 Tiptap ExtensionManager 不做去重，两个同名扩展的插件都会被注册。

**教训**：Tiptap 不支持同名扩展覆盖，需要从源头修复或使用 Vite alias。

### 4. ProseMirror 插件内部错误无法拦截

**问题**：错误发生在 ProseMirror 的 `Plugin.apply` → `EditorState.applyInner` 调用链中，上层的 try-catch 无法拦截。

**教训**：ProseMirror 插件内部的错误需要在插件层面修复，不能依赖上层防御性代码。

### 5. React 19 渲染时序

**问题**：React 19 的渲染模式与 Tiptap v3 的编辑器初始化存在时序差异。

**建议**：使用 `immediatelyRender: false` 让编辑器在 `useEffect` 中创建，避免首帧渲染时的竞态条件。

## 文件结构速查

```
src/
├── App.tsx                    # 应用主组件，状态管理
├── App.css                    # 主布局样式
├── main.tsx                   # 入口
├── themes.tsx                 # 主题 Context
├── ThemeManager.ts            # 8 种内置主题定义
├── CustomThemeManager.ts      # 自定义主题管理
├── codeThemes.ts              # 代码语法高亮配色
├── Sidebar.tsx                # 侧栏（文件树+大纲+仓库切换）
├── Sidebar.css                # 侧栏样式
├── Editor/
│   ├── TipTapEditor.tsx       # TipTap 编辑器主组件
│   ├── SourceEditor.tsx       # CodeMirror 源码编辑器
│   ├── CodeMirrorEditor.tsx   # CodeMirror 核心封装
│   ├── ContextMenu.tsx        # 右键菜单
│   ├── types.ts               # 编辑器类型定义
│   ├── shortcuts.ts           # 快捷键管理
│   ├── theme.css              # 编辑器样式
│   ├── frontmatter.ts         # YAML frontmatter 解析器
│   ├── PropertiesPanel.tsx    # Frontmatter 属性显示面板
│   ├── index.tsx              # Barrel re-export
│   └── extensions/            # 自定义 TipTap 扩展
│       ├── wiki-link.ts
│       ├── search-highlight.ts
│       ├── code-block-toolbar.ts
│       └── custom-commands.ts
├── WikiLinkAutocomplete.tsx   # WikiLink 自动补全
├── BacklinksPanel.tsx         # 反向链接面板
├── LinkIndexService.ts        # 链接索引服务
├── LinkParser.ts              # [[wiki-link]] 解析器
├── WikiLinkProcessor.ts       # DOM 层 WikiLink 处理器
├── ImageManager.ts            # 图片存储管理
├── GraphView.tsx              # 知识图谱视图
├── GraphWindow.tsx            # 知识图谱独立窗口
├── MindmapView.tsx            # 思维导图视图
├── MindmapWindow.tsx          # 思维导图独立窗口
├── FilePreview.tsx            # 非 MD 文件预览（图片/视频/音频/PDF）
├── PublishPanel.tsx           # 发布操作面板
├── PublishSettings.tsx        # 发布设置表单
├── PublishService.ts          # 发布服务
├── ConfirmDialog.tsx          # 确认对话框（支持 Y/N 快捷键）
├── Settings.tsx               # 设置面板
├── CommandPalette.tsx         # 命令面板
├── QuickOpen.tsx              # 快速打开文件
├── Updater.ts                 # 自动更新（检查/下载/安装/重启）
├── useVaultWatcher.ts         # 仓库文件监听 Hook
└── Canvas/                    # 白板功能
    ├── CanvasView.tsx          # 主画布组件（React Flow）
    ├── CanvasWindow.tsx        # 独立窗口容器
    ├── CanvasToolbar.tsx       # 顶部工具栏
    ├── canvas-store.ts         # Zustand 状态管理
    ├── canvas-utils.ts         # JSON Canvas ↔ React Flow 转换
    ├── canvas-settings.ts      # 白板设置
    ├── CanvasSettings.tsx      # 设置界面
    ├── NotePicker.tsx          # 笔记选择器
    ├── MediaPicker.tsx         # 媒体文件选择器
    ├── AlignmentGuides.tsx     # 对齐参考线
    ├── canvas.css              # 白板样式
    ├── nodes/                  # 节点组件
    │   ├── TextNode.tsx        # 文本节点（TipTap IR 模式）
    │   ├── FileNode.tsx        # 文件引用节点
    │   ├── NoteNode.tsx        # 笔记卡片（渲染 Markdown）
    │   ├── MediaNode.tsx       # 多媒体节点
    │   ├── CanvasNode.tsx      # 白板嵌入节点
    │   ├── UrlNode.tsx         # URL 链接节点
    │   ├── ImageNode.tsx       # 图片节点
    │   └── GroupNode.tsx       # 分组节点
    └── edges/
        └── CanvasEdge.tsx      # 自定义边（带箭头+标签）
```

## 重要开发规则

### 1. 文件路径必须使用相对路径

**规则**：在白板（Canvas）功能中，所有文件路径必须使用相对路径（相对于 Vault 根目录），不能使用绝对路径。

**原因**：
- 绝对路径在不同机器上无法使用
- 移动画布文件后路径会失效
- 需要与 Obsidian 保持兼容

**实现方式**：
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

**使用场景**：
- 插入笔记卡片（.md 文件）
- 插入媒体文件（图片、视频、音频、PDF）
- 插入白板文件（.canvas）
- 粘贴图片到白板

### 2. 程序化修改编辑器内容后必须同步 React 状态

（原有规则保持不变）
