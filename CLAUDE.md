# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Tydora（代码内称为 "zmd"）是一个基于 Tauri v2 + React 19 的桌面 Markdown 编辑器。使用 Vditor 作为编辑器引擎，支持 WYSIWYG 和源码两种编辑模式，以及基于"仓库（Vault）"概念的文件管理。

## 技术栈

- **前端**: React 19 + TypeScript + Vite 6
- **后端**: Rust (Tauri v2)，Windows 为主要目标平台
- **编辑器**: Vditor 3.x（本地部署，非 CDN 加载）
- **Tauri 插件**: `plugin-fs`（文件系统）、`plugin-dialog`（系统对话框）

## 常用命令

```bash
# 安装依赖
npm install

# 开发模式（先复制 Vditor 资源到 public/，再启动 Vite dev server，端口 1420）
npm run dev

# 构建前端（TypeScript 编译 + 复制 Vditor + Vite 打包）
npm run build

# 仅复制 Vditor 资源（从 node_modules/vditor/dist 到 public/vditor/dist）
npm run copy-vditor

# 启动 Tauri（桌面应用）
npm run tauri
```

构建步骤的依赖关系：`npm run dev/build` 自动调用 `npm run copy-vditor`，后者将 Vditor 的 JS/CSS/字体/图标资源复制到 `public/vditor/` 以便 Tauri 在运行时加载。

## 架构概览

### 前端 (src/)

**入口**: `main.tsx` → 用 `ThemeProvider` 包裹整个应用，挂载到 `#root`。

**主题系统**: `themes.tsx` 提供 `ThemeContext`，支持 4 种主题（`catppuccin-mocha`、`white`、`mint`、`mint-dark`）。主题通过 `document.documentElement.dataset.theme` 设置，并在切换时同步更新 highlight.js 代码高亮样式。默认主题为 `mint`。

**App 组件** (`App.tsx`) — 应用状态中心：
- 管理编辑器内容 (`content`)、当前文件路径 (`fileName`)、修改状态 (`modified`)、编辑模式 (`viewMode: "wysiwyg" | "sv"`)
- 管理仓库列表 (`vaults`)、当前激活仓库索引 (`activeVaultIndex`)、侧栏状态 (`sidebarOpen`/`sidebarWidth`)
- 所有状态持久化到 `localStorage`：`zmd-vaults`、`zmd-active-vault`、`zmd-sidebar-width`、`zmd-window-state`、`zmd-theme`
- 窗口位置/大小通过 Tauri Window API 恢复和防抖保存
- 自定义窗口控件（最小化/最大化/关闭），替代系统原生标题栏
- Ctrl+S 全局快捷键保存
- `EditorErrorBoundary` 类组件防止编辑器崩溃导致白屏

**VditorEditor** (`VditorEditor.tsx`) — Vditor 封装：
- 使用 `forwardRef` + `useImperativeHandle` 暴露 `getValue`/`setValue`/`resize` 方法
- 组件有自己的加载状态机：`loading → ready/error`，带 15 秒超时检测
- 通过内部标志 `isInternalRef` 区分程序化变更和用户输入，避免 `setValue` 后触发 `onChange` 造成循环
- Vditor 配置：CDN 路径设为 `/vditor`（本地），工具栏隐藏，只用预览模式 `"editor"`（单面板，不分屏）
- 通过 MutationObserver 按需隐藏特定元素类型的 popover（段落/列表/引用的 popover 隐藏，代码块/表格保留）

**Sidebar** (`Sidebar.tsx`) — 包含三个子模块：
1. **FileTree**: 递归树形组件，渲染仓库目录文件结构。支持展开/折叠目录、右键菜单（新建文件/文件夹、重命名、删除、复制路径）、内联重命名、拖拽移动文件到其他目录。通过 mouse-event 实现拖拽（非 HTML5 Drag API）。编辑中的节点由父组件通过 `editingPath` 状态跟踪。
2. **Outline**: 解析 Markdown 标题（`# ~ ######`），渲染可点击的大纲列表，点击滚动到编辑器对应位置。
3. **VaultSwitcher**: 底部仓库选择器，含仓库列表下拉菜单和主题选择设置弹出面板。

**Vault 概念**：用户选择一个本地文件夹作为"仓库"，应用展示该文件夹内的文件树。支持多仓库切换，仓库列表持久化到 localStorage。

### 后端 (src-tauri/)

**入口**: `main.rs` → 调用 `tydora_lib::run()`

**lib.rs**:
- 注册两个自定义 Tauri 命令：`get_default_content`、`get_app_version`
- 注册 `tauri-plugin-fs` 和 `tauri-plugin-dialog` 插件（前端通过 `@tauri-apps/plugin-fs` 和 `@tauri-apps/plugin-dialog` 调用）
- Debug 模式下自动打开 DevTools
- 设置 `windows_subsystem = "windows"` 防止 release 模式出现控制台窗口

**Cargo 依赖**: tauri 2、tauri-plugin-fs、tauri-plugin-dialog、serde、serde_json

### 构建配置

- **Vite** (`vite.config.ts`): `@vitejs/plugin-react`，端口 1420 严格模式，忽略 `src-tauri/` 的文件监听
- **TypeScript**: target ES2020，严格模式，路径别名 `@/* → src/*`
- **Rust**: 链接器 `rust-lld`，目标 `x86_64-pc-windows-msvc`

### 资源复制脚本

`scripts/copy-vditor-assets.mjs` 在开发/构建前运行，将 `node_modules/vditor/dist` 复制到 `public/vditor/dist`，并创建 `highlight.min.js → highlight.js` 别名以兼容 Vditor 的模块加载逻辑。

## 主题/样式文件

- `src/themes.css` — CSS 变量定义 4 种主题的颜色方案
- `src/vditor-theme.css` — 编辑器区域深色/浅色主题覆盖
- `src/App.css` — 主布局（app、main-container、editor-container、顶部/底部栏、窗口控件）
- `src/Sidebar.css` — 侧栏/文件树/右键菜单样式
- `src/VditorEditor.css` — 编辑器 wrapper 和加载/错误状态
- `src/Settings.css` — 设置面板样式

## 重要开发规则

### 1. 程序化修改编辑器内容后必须同步 React 状态

Vditor 的 `setValue()` 方法内部 `enableInput: false`，不会触发 `onChange` 回调。此外 VditorEditor 的 `input` 回调有 `isInternalRef` 守卫：

```typescript
// VditorEditor.tsx — input 回调
input: (val) => {
    if (isInternalRef.current) {     // ← 程序化 setValue 后会置为 true
        isInternalRef.current = false;
        return;                      // ← 直接返回，不调用 onChange！
    }
    onChangeRef.current(val);
}
```

**正确做法**：程序化修改内容后，绕过 Vditor 回调，直接用 `onChangeRef.current(vditor.getValue())` 同步状态：

```typescript
// ✅ 正确
onChangeRef.current(vditor.getValue());

// ❌ 错误 — 可能被 isInternalRef 拦截
internalVditor.options.input(vditor.getValue());
```

`onChangeRef` 定义在 VditorEditor 组件中：`const onChangeRef = useRef(onChange); onChangeRef.current = onChange;`

### 2. Vditor WYSIWYG vs SV 模式差异

| 特性 | WYSIWYG (`mode === "wysiwyg"`) | SV (`mode === "sv"`) |
|------|-------------------------------|----------------------|
| DOM 元素 | `<div class="vditor-wysiwyg">` | `<pre class="vditor-sv" contenteditable>` |
| 获取内容 | `vditor.lute.VditorDOM2Md(innerHTML)` | `element.textContent`（纯文本） |
| 设置内容 | `vditor.lute.VditorDOM2VditorDOM(md)` | `vditor.lute.SpinVditorSVDOM(md)` |
| textContent 与 markdown 关系 | **不匹配**（textContent 单 `\n`，markdown 双 `\n`） | **匹配**（textContent 即 markdown） |

因此 WYSIWYG 模式下**不能用** TreeWalker 在 textContent 中计算偏移并在 markdown 中定位——两者不一致。应用 `sel.toString()` + `md.indexOf()` 定位。

### 3. 右键菜单 executeCommand 命令分发

`src/VditorEditor.tsx` 中的 `executeCommand` 按以下顺序处理：

1. **标题/段落** (`heading-X`, `paragraph`): DOM 直接操作（WYSIWYG 替换 outerHTML，SV 走 markdown 文本）
2. **块级命令** (`quote`, `list`, `ordered-list`, `check`, `inline-code`, `code`): markdown 文本逐行处理，toggle 行为
3. **加粗/斜体/删除线**: `safeClick` → `execCommand` 兜底
4. **超链接**: 单行走工具栏，多行 markdown 方式 + prompt
5. **其余**: `safeClick`（try-catch 包裹，防止跨块 `surroundContents` 报错）

块级命令空行处理：
- **引用**: 空行保留 `> `（保持引用块连续性）
- **列表/有序列表/任务列表**: 过滤空行，紧凑排列
- **行内代码/代码块**: 空行不动（代码块内空行有意义）

### 4. 子菜单边缘检测

`context-menu-submenu-wrapper` 有 `onMouseEnter` 处理，检测子菜单是否会超出窗口边界，超出时设置 `data-flip-x`/`data-flip-y` 属性翻转方向。CSS 对应规则在 `VditorEditor.css` 中。

### 5. Mint 主题颜色陷阱

Mint 主题中 `--border: #d9ede5` 和 `--bg-secondary: #d9ede5` 相同，用 `--border` 做分割线会不可见。应使用 `var(--text-secondary)` + `opacity: 0.2`。
