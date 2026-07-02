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

# 启动 Tauri（桌面应用）
npm run tauri
```

## 架构概览

### 前端 (src/)

**入口**: `main.tsx` → 用 `ThemeProvider` 包裹整个应用，挂载到 `#root`。

**主题系统**: `themes.tsx` 提供 `ThemeContext`，支持 7 种主题（`white`、`mint`、`mint-dark`、`liquid-glass`、`claude-code`、`purple`、`hermes`）。主题通过 `document.documentElement.dataset.theme` 设置，并在切换时同步更新 highlight.js 代码高亮样式。默认主题为 `mint`。

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

**lib.rs**:
- 注册两个自定义 Tauri 命令：`get_default_content`、`get_app_version`
- 注册 `tauri-plugin-fs` 和 `tauri-plugin-dialog` 插件
- Debug 模式下自动打开 DevTools
- 设置 `windows_subsystem = "windows"` 防止 release 模式出现控制台窗口

### 构建配置

- **Vite** (`vite.config.ts`): `@vitejs/plugin-react`，端口 1420 严格模式，忽略 `src-tauri/` 的文件监听
- **TypeScript**: target ES2020，严格模式，路径别名 `@/* → src/*`
- **Rust**: 链接器 `rust-lld`，目标 `x86_64-pc-windows-msvc`

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

## 主题/样式文件

- `src/themes.css` — CSS 变量定义 7 种主题的颜色方案
- `src/App.css` — 主布局（app、main-container、editor-container、顶部/底部栏、窗口控件）
- `src/Sidebar.css` — 侧栏/文件树/右键菜单样式
- `src/Editor/theme.css` — TipTap 编辑器样式、代码块工具栏、右键菜单、源码编辑器样式
- `src/Settings.css` — 设置面板样式

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
├── main.tsx                   # 入口
├── themes.tsx                 # 主题系统
├── Sidebar.tsx                # 侧栏（文件树+大纲+仓库切换）
├── Editor/
│   ├── TipTapEditor.tsx       # TipTap 编辑器主组件
│   ├── SourceEditor.tsx       # CodeMirror 源码编辑器
│   ├── CodeMirrorEditor.tsx   # CodeMirror 核心封装
│   ├── ContextMenu.tsx        # 右键菜单
│   ├── types.ts               # 编辑器类型定义
│   ├── shortcuts.ts           # 快捷键管理
│   ├── theme.css              # 编辑器样式
│   └── extensions/            # 自定义 TipTap 扩展
│       ├── wiki-link.ts
│       ├── search-highlight.ts
│       ├── code-block-toolbar.ts
│       └── custom-commands.ts
├── WikiLinkAutocomplete.tsx   # WikiLink 自动补全
├── GraphView.tsx              # 知识图谱
├── MindmapView.tsx            # 思维导图
├── Settings.tsx               # 设置面板
├── CommandPalette.tsx         # 命令面板
└── QuickOpen.tsx              # 快速打开文件
```
