# Tydora 技术架构文档

## 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [前端架构](#前端架构)
- [编辑器架构](#编辑器架构)
- [WikiLink 系统](#wikilink-系统)
- [后端架构](#后端架构)
- [多窗口架构](#多窗口架构)
- [数据流](#数据流)
- [CI/CD](#cicd)
- [开发指南](#开发指南)

---

## 项目概述

Tydora 是一款基于 Tauri v2 + React 19 构建的桌面 Markdown 编辑器，支持 WYSIWYG（所见即所得）和源码两种编辑模式，以及基于"仓库（Vault）"概念的文件管理。

### 核心特性

- **双编辑模式**：IR（即时渲染/WYSIWYG）和 SV（源码模式）
- **Vault 文件管理**：支持多仓库切换，递归文件树展示
- **WikiLink 双向链接**：Obsidian 风格的 `[[双向链接]]` 支持
- **知识图谱可视化**：基于 D3.js 的关系图谱
- **思维导图**：基于 Markmap 的思维导图生成
- **静态网站发布**：将 Vault 发布为静态网站
- **多窗口架构**：支持独立窗口编辑、设置、图谱等
- **自定义主题**：8 种内置主题 + 自定义主题支持

---

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 19.x | UI 框架 |
| TypeScript | 5.6+ | 类型安全 |
| Vite | 6.x | 构建工具 |
| TipTap | 3.27.1 | WYSIWYG 编辑器 |
| CodeMirror | 6.x | 源码编辑器 |
| D3.js | 7.x | 知识图谱可视化 |
| Markmap | 0.18.x | 思维导图 |
| Mermaid | 11.x | 图表渲染 |
| highlight.js | 11.x | 代码语法高亮 |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Rust | 2021 Edition | 后端语言 |
| Tauri | 2.x | 桌面应用框架 |
| notify | 6.x | 文件系统监听 |
| serde/serde_json | 1.x | 数据序列化 |

### Tauri 插件

| 插件 | 用途 |
|------|------|
| tauri-plugin-fs | 文件系统访问 |
| tauri-plugin-dialog | 系统对话框 |
| tauri-plugin-window-state | 窗口状态持久化 |
| tauri-plugin-updater | 应用自动更新 |
| tauri-plugin-process | 进程管理 |

---

## 系统架构

```mermaid
graph TB
    subgraph Frontend["前端 (React + TypeScript)"]
        direction TB
        App[App.tsx<br/>应用主组件]
        Editor[Editor 组件<br/>TipTap + CodeMirror]
        Sidebar[Sidebar 组件<br/>文件树 + 大纲 + 仓库切换]
        ThemeSystem[主题系统<br/>8 种内置 + 自定义]
        WikiLinkSystem[WikiLink 系统<br/>解析 + 索引 + 渲染]
        PublishSystem[发布系统<br/>静态网站生成]
    end
    
    subgraph Backend["后端 (Rust/Tauri)"]
        direction TB
        Commands[Tauri Commands<br/>15 个自定义命令]
        Plugins[Tauri Plugins<br/>5 个官方插件]
        Watcher[文件监听<br/>notify crate]
        URI[URI Scheme<br/>local-file://]
    end
    
    subgraph External["外部依赖"]
        direction TB
        NodeJS[Node.js<br/>markdown-publish CLI]
        Browser[系统浏览器<br/>预览发布结果]
    end
    
    App --> Editor
    App --> Sidebar
    App --> ThemeSystem
    App --> WikiLinkSystem
    App --> PublishSystem
    
    App -->|invoke| Commands
    Commands --> Plugins
    Commands --> Watcher
    Commands --> URI
    
    PublishSystem -->|spawn| NodeJS
    NodeJS --> Browser
```

---

## 前端架构

### 组件层次结构

```mermaid
graph TB
    Main[main.tsx<br/>应用入口]
    ThemeProvider[ThemeProvider<br/>主题上下文]
    App[App.tsx<br/>状态管理]
    
    subgraph Layout["布局组件"]
        TitleBar[TitleBar<br/>自定义标题栏]
        SidebarComp[Sidebar<br/>侧栏]
        EditorPanel[EditorPanel<br/>编辑器面板]
        StatusBar[StatusBar<br/>状态栏]
    end
    
    subgraph SidebarChildren["Sidebar 子组件"]
        FileTree[FileTree<br/>文件树]
        Outline[Outline<br/>大纲]
        VaultSwitcher[VaultSwitcher<br/>仓库切换]
    end
    
    subgraph EditorChildren["Editor 子组件"]
        TipTapEditor[TipTapEditor<br/>WYSIWYG 模式]
        SourceEditor[SourceEditor<br/>源码模式]
        ContextMenu[ContextMenu<br/>右键菜单]
        PropertiesPanel[PropertiesPanel<br/>Frontmatter 属性]
    end
    
    subgraph Floating["浮动组件"]
        WikiLinkAutocomplete[WikiLinkAutocomplete<br/>链接补全]
        QuickOpen[QuickOpen<br/>快速打开]
        CommandPalette[CommandPalette<br/>命令面板]
        ConfirmDialog[ConfirmDialog<br/>确认对话框]
    end
    
    Main --> ThemeProvider
    ThemeProvider --> App
    App --> Layout
    App --> Floating
    
    SidebarComp --> SidebarChildren
    EditorPanel --> EditorChildren
```

### 状态管理

App.tsx 是应用的状态中心，管理以下核心状态：

| 状态 | 类型 | 持久化 | 说明 |
|------|------|--------|------|
| `content` | string | 否 | 编辑器内容 |
| `fileName` | string | 否 | 当前文件路径 |
| `modified` | boolean | 否 | 修改状态 |
| `viewMode` | "ir" \| "sv" | localStorage | 编辑模式 |
| `vaults` | VaultInfo[] | localStorage | 仓库列表 |
| `activeVaultIndex` | number | localStorage | 当前仓库索引 |
| `sidebarOpen` | boolean | 否 | 侧栏开关 |
| `sidebarWidth` | number | localStorage | 侧栏宽度 |

### 主题系统

```mermaid
graph LR
    ThemeManager[ThemeManager.ts<br/>8 种内置主题]
    CustomThemeManager[CustomThemeManager.ts<br/>自定义主题管理]
    themesCSS[themes.css<br/>CSS 变量定义]
    codeThemes[codeThemes.ts<br/>11 种代码高亮]
    
    ThemeManager --> themesCSS
    CustomThemeManager --> themesCSS
    themesCSS -->|document.documentElement.dataset.theme| App
    
    subgraph BuiltinThemes["内置主题"]
        White[white]
        Mint[mint]
        MintDark[mint-dark]
        LiquidGlass[liquid-glass]
        ClaudeCode[claude-code]
        Purple[purple]
        Hermes[hermes]
        Next[next]
    end
    
    ThemeManager --> BuiltinThemes
```

---

## 编辑器架构

### TipTap 编辑器

```mermaid
graph TB
    TipTapEditor[TipTapEditor.tsx<br/>编辑器主组件]
    
    subgraph Extensions["TipTap 扩展"]
        StarterKit[StarterKit<br/>核心扩展集]
        Markdown[Markdown<br/>tiptap-markdown]
        CodeBlock[CodeBlockLowlight<br/>代码块]
        Table[Table<br/>表格]
        TaskList[TaskList<br/>任务列表]
        WikiLinkExt[WikiLink<br/>自定义扩展]
        SearchHighlight[SearchHighlight<br/>搜索高亮]
        CodeBlockToolbar[CodeBlockToolbar<br/>代码块工具栏]
        CustomCommands[CustomCommands<br/>命令分发]
    end
    
    subgraph Modes["编辑模式"]
        IR[IR 模式<br/>即时渲染/WYSIWYG]
        SV[SV 模式<br/>源码模式]
    end
    
    subgraph CodeMirror["CodeMirror 6"]
        CMEditor[CodeMirrorEditor.tsx]
        CMLang[lang-markdown]
        CMSearch[search]
    end
    
    TipTapEditor --> Extensions
    TipTapEditor --> Modes
    SV --> CodeMirror
```

### 编辑器扩展列表

| 扩展 | 用途 |
|------|------|
| StarterKit | 核心扩展集合（已禁用部分以单独配置） |
| Bold/Italic/Strike/Code | 行内格式 |
| Blockquote/BulletList/OrderedList/ListItem | 块级格式 |
| CodeBlockLowlight | 代码块（带语法高亮） |
| Image | 图片（支持 inline、base64） |
| Link | 超链接 |
| Table/TableRow/TableCell/TableHeader | 表格 |
| TaskList/TaskItem | 任务列表 |
| Highlight | 高亮 |
| Typography | 排版优化 |
| Placeholder | 占位符文本 |
| Markdown (tiptap-markdown) | Markdown 序列化 |
| WikiLink | Obsidian 风格双向链接 |
| SearchHighlight | 搜索结果高亮 |
| CodeBlockToolbar | 代码块工具栏 |
| CustomCommands | 命令分发 |

### EditorHandle 接口

```typescript
interface EditorHandle {
  getValue: () => string;           // 获取 Markdown 内容
  setValue: (value: string) => void; // 设置内容
  insertTextAtCursor: (text: string) => void; // 在光标处插入文本
  replaceRangeWithWikiLink: (...) => void;     // 替换为 WikiLink
  resize: () => void;               // 调整大小
  highlightSearch: (query: string) => void;    // 高亮搜索
  clearHighlight: () => void;       // 清除高亮
  executeCommand: (name: string) => void;      // 执行命令
  scrollToHeading: (...) => void;   // 滚动到标题
  scrollToLine: (line: number) => void;        // 滚动到行
  getCursorOffset: () => number;    // 获取光标偏移
  isSourceMode: () => boolean;      // 是否源码模式
}
```

---

## WikiLink 系统

```mermaid
sequenceDiagram
    participant User as 用户输入
    participant Editor as TipTap 编辑器
    participant Parser as LinkParser
    participant Index as LinkIndexService
    participant Processor as WikiLinkProcessor
    participant Autocomplete as WikiLinkAutocomplete
    
    User->>Editor: 输入 [[笔记名
    Editor->>Parser: 触发 wiki-link-trigger 事件
    Parser->>Autocomplete: 解析并返回链接列表
    Autocomplete->>Editor: 显示补全下拉框
    
    User->>Autocomplete: 选择笔记
    Autocomplete->>Editor: 替换文本为 [[笔记名]]
    
    Editor->>Processor: DOM 变更通知
    Processor->>Parser: 解析 [[...]] 语法
    Parser->>Processor: 返回 WikiLink 对象
    Processor->>Editor: 渲染为可点击链接
    
    Note over Index: 后台任务
    Index->>Parser: 批量解析所有文件
    Parser->>Index: 返回链接映射
    Index->>Index: 构建 outlinks/backlinks
```

### 数据结构

```mermaid
classDiagram
    class WikiLink {
        +string raw
        +string noteName
        +string? heading
        +string? alias
        +boolean isEmbed
        +number startIndex
        +number endIndex
    }
    
    class LinkIndex {
        +Map~string, string[]~ outlinks
        +Map~string, string[]~ backlinks
        +Map~string, string~ fileByName
        +buildIndex(vaultPath)
        +incrementalUpdate(filePath, content)
        +serialize(): JSON
    }
    
    class LinkParser {
        +parseWikiLinks(markdown): WikiLink[]
    }
    
    LinkParser --> WikiLink : 生成
    LinkIndex --> LinkParser : 使用
```

### 核心模块

| 模块 | 文件 | 职责 |
|------|------|------|
| 解析器 | `LinkParser.ts` | 正则匹配 `[[link]]` 和 `![[embed]]` 语法 |
| 索引服务 | `LinkIndexService.ts` | 维护 outlinks/backlinks 映射，支持全量/增量更新 |
| DOM 处理器 | `WikiLinkProcessor.ts` | 将文本节点中的 `[[...]]` 转换为可点击链接 |
| TipTap 扩展 | `extensions/wiki-link.ts` | 编辑器内的 WikiLink Node 扩展 |
| 自动补全 | `WikiLinkAutocomplete.tsx` | 监听事件显示补全列表 |
| 反向链接面板 | `BacklinksPanel.tsx` | 展示当前文件的反向链接和出链 |

---

## 后端架构

```mermaid
graph TB
    subgraph Tauri["Tauri 后端"]
        main[main.rs<br/>入口]
        lib[lib.rs<br/>核心逻辑]
        
        subgraph Commands["自定义命令"]
            GetDefaultContent[get_default_content]
            GetAppVersion[get_app_version]
            OpenSettings[open_settings_window]
            OpenFileNewWindow[open_file_in_new_window]
            OpenFileLocation[open_file_location]
            OpenFile[open_file]
            OpenDirectory[open_directory]
            OpenMindmap[open_mindmap_window]
            OpenGraph[open_graph_window]
            WatchVault[watch_vault]
            UnwatchVault[unwatch_vault]
            RunPublish[run_markdown_publish]
            PreviewSite[preview_site]
            StopPreview[stop_preview]
        end
        
        subgraph State["状态管理"]
            WatcherState[WatcherState<br/>Mutex&lt;Option&lt;Watcher&gt;&gt;]
            PreviewServer[PreviewServer<br/>Mutex&lt;Option&lt;Child&gt;&gt;]
        end
        
        subgraph Plugins["Tauri 插件"]
            FS[plugin-fs]
            Dialog[plugin-dialog]
            WindowState[plugin-window-state]
            Updater[plugin-updater]
            Process[plugin-process]
        end
    end
    
    main --> lib
    lib --> Commands
    lib --> State
    lib --> Plugins
```

### 命令列表

| 命令 | 用途 | 参数 |
|------|------|------|
| `get_default_content` | 获取默认编辑器内容 | 无 |
| `get_app_version` | 获取应用版本号 | 无 |
| `get_cwd` | 获取当前工作目录 | 无 |
| `open_settings_window` | 打开设置窗口 | 无 |
| `open_file_in_new_window` | 在新窗口打开文件 | file_path, width?, height? |
| `open_file_location` | 在系统文件管理器中定位文件 | file_path |
| `open_file` | 用系统默认应用打开文件 | file_path |
| `open_directory` | 在系统文件管理器中打开目录 | dir_path |
| `open_mindmap_window` | 打开思维导图窗口 | 无 |
| `open_graph_window` | 打开知识图谱窗口 | 无 |
| `watch_vault` | 启动仓库文件系统监听 | path |
| `unwatch_vault` | 停止仓库文件系统监听 | 无 |
| `run_markdown_publish` | 调用 CLI 发布网站 | vault_dir, out_dir, config |
| `preview_site` | 启动 HTTP 服务器预览 | dir |
| `stop_preview` | 停止预览 HTTP 服务器 | 无 |

### 文件监听机制

```mermaid
sequenceDiagram
    participant Frontend as 前端
    participant Tauri as Tauri Backend
    participant Watcher as notify Watcher
    participant FS as 文件系统
    
    Frontend->>Tauri: watch_vault(path)
    Tauri->>Watcher: 创建 RecommendedWatcher
    Watcher->>FS: 注册监听 (RecursiveMode::Recursive)
    
    loop 文件变更
        FS->>Watcher: 触发事件
        Watcher->>Tauri: emit("vault://changed", event)
        Tauri->>Frontend: 发送事件
        Frontend->>Frontend: 防抖处理
        Frontend->>Frontend: 更新 LinkIndexService
    end
    
    Frontend->>Tauri: unwatch_vault()
    Tauri->>Watcher: 释放 watcher
```

---

## 多窗口架构

```mermaid
graph TB
    subgraph Windows["窗口管理"]
        Main[主窗口<br/>1200×800<br/>编辑器 + 侧栏]
        Settings[设置窗口<br/>800×600<br/>独立设置面板]
        Editor[文件窗口<br/>1200×800<br/>独立编辑文件]
        Graph[图谱窗口<br/>1000×700<br/>知识图谱可视化]
        Mindmap[思维导图窗口<br/>900×600<br/>思维导图可视化]
    end
    
    subgraph Communication["窗口间通信"]
        Events[Tauri Events<br/>vault://changed]
        State[localStorage<br/>共享状态]
        Invoke[IPC invoke<br/>命令调用]
    end
    
    Main -->|open_settings_window| Settings
    Main -->|open_file_in_new_window| Editor
    Main -->|open_graph_window| Graph
    Main -->|open_mindmap_window| Mindmap
    
    Main --> Events
    Settings --> State
    Editor --> State
    Graph --> State
```

### 窗口类型

| 窗口 | 触发方式 | 默认大小 | 说明 |
|------|----------|----------|------|
| 主窗口 | 应用启动 | 1200×800 | 编辑器、侧栏等核心 UI |
| 设置窗口 | `open_settings_window` | 800×600 | 独立设置面板 |
| 文件窗口 | `open_file_in_new_window` | 1200×800 | 在独立窗口中编辑文件 |
| 图谱窗口 | `open_graph_window` | 1000×700 | 知识图谱可视化 |
| 思维导图窗口 | `open_mindmap_window` | 900×600 | 思维导图可视化 |

---

## 数据流

### 文件读写流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant App as App.tsx
    participant FS as Tauri FS Plugin
    participant Disk as 磁盘
    
    Note over User,Disk: 打开文件
    User->>App: 选择文件
    App->>FS: readTextFile(path)
    FS->>Disk: 读取文件
    Disk-->>FS: 文件内容
    FS-->>App: Markdown 字符串
    App->>App: setContent(content)
    
    Note over User,Disk: 保存文件
    User->>App: Ctrl+S
    App->>App: getValue()
    App->>FS: writeTextFile(path, content)
    FS->>Disk: 写入文件
    Disk-->>FS: 写入成功
    FS-->>App: 完成
    App->>App: setModified(false)
```

### 状态持久化

```mermaid
graph LR
    subgraph State["应用状态"]
        Vaults[vaults<br/>仓库列表]
        ActiveVault[activeVaultIndex<br/>当前仓库]
        SidebarWidth[sidebarWidth<br/>侧栏宽度]
        Theme[theme<br/>当前主题]
        WindowState[windowState<br/>窗口位置/大小]
    end
    
    subgraph Storage["localStorage"]
        VAULTS_KEY[zmd-vaults]
        ACTIVE_KEY[zmd-active-vault]
        WIDTH_KEY[zmd-sidebar-width]
        THEME_KEY[zmd-theme]
        WINDOW_KEY[zmd-window-state]
    end
    
    Vaults --> VAULTS_KEY
    ActiveVault --> ACTIVE_KEY
    SidebarWidth --> WIDTH_KEY
    Theme --> THEME_KEY
    WindowState --> WINDOW_KEY
```

### 窗口状态恢复

```mermaid
sequenceDiagram
    participant App as App.tsx
    participant Window as Tauri Window
    participant Storage as localStorage
    
    Note over App,Storage: 启动时恢复
    App->>Storage: 读取 zmd-window-state
    Storage-->>App: {x, y, width, height}
    App->>Window: setSize(size)
    App->>Window: setPosition(pos)
    
    Note over App,Storage: 关闭时保存
    Window->>App: 窗口移动/调整大小
    App->>App: 防抖处理 (500ms)
    App->>Window: outerPosition/outerSize
    Window-->>App: 当前位置/大小
    App->>Storage: 保存 zmd-window-state
```

---

## CI/CD

### GitHub Actions 工作流

```mermaid
flowchart TB
    subgraph Trigger ["Trigger"]
        Push["Push to release branch"]
        Manual["Manual dispatch"]
    end

    subgraph Matrix ["Build Matrix"]
        Windows["windows-latest"]
        MacAarch["macos-latest aarch64"]
        MacIntel["macos-latest x86_64"]
        Linux["ubuntu-22.04"]
    end

    subgraph Steps ["Build Steps"]
        Checkout["Checkout code"]
        Node["Setup Node.js"]
        Rust["Install Rust stable"]
        Cache["Rust cache"]
        LinuxDeps["Install Linux deps"]
        Install["npm install"]
        Build["Tauri action build"]
        Sign["Code signing"]
    end

    subgraph Output ["Release"]
        Release["Draft GitHub Release"]
        Artifacts["NSIS / DMG / AppImage"]
    end

    Push --> Matrix
    Manual --> Matrix
    Matrix --> Checkout
    Checkout --> Node
    Node --> Rust
    Rust --> Cache
    Cache --> LinuxDeps
    LinuxDeps --> Install
    Install --> Build
    Build --> Sign
    Sign --> Release
    Sign --> Artifacts
```

### Release 工作流

| 步骤 | 说明 |
|------|------|
| 1. Checkout | 拉取代码 |
| 2. Setup Node.js | 安装 LTS 版本 Node.js |
| 3. Install Rust | 安装 Rust stable 工具链 |
| 4. Rust Cache | 缓存 Rust 构建产物 |
| 5. Linux Dependencies | 安装 Linux 依赖 (webkit2gtk 等) |
| 6. npm install | 安装前端依赖 |
| 7. Tauri Action | 构建应用并签名 |
| 8. Release | 创建 Draft Release |

### 文档部署

```mermaid
flowchart LR
    Push["Push to main"] --> Check{"Changes in website/?"}
    Check -->|Yes| Build["MkDocs Build"]
    Check -->|No| Skip["Skip"]
    Build --> Deploy["Deploy to GitHub Pages"]
```

---

## 开发指南

### 环境搭建

```bash
# 1. 克隆仓库
git clone https://github.com/zuorn/Tydora.git
cd Tydora

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev

# 4. 启动 Tauri 应用
npm run tauri
```

### 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 (端口 1420) |
| `npm run build` | 构建前端 (TypeScript + Vite) |
| `npm run preview` | 预览生产构建 |
| `npm run tauri` | 启动 Tauri 桌面应用 |
| `npm run docs:build` | 构建 MkDocs 文档站点 |
| `npm run docs:serve` | 本地预览文档站点 |

### 项目结构

```
Tydora/
├── src/                          # 前端源码
│   ├── App.tsx                   # 应用主组件
│   ├── main.tsx                  # 入口
│   ├── themes.tsx                # 主题 Context
│   ├── ThemeManager.ts           # 内置主题定义
│   ├── Sidebar.tsx               # 侧栏组件
│   ├── Editor/                   # 编辑器模块
│   │   ├── TipTapEditor.tsx      # TipTap 编辑器
│   │   ├── SourceEditor.tsx      # CodeMirror 编辑器
│   │   ├── extensions/           # 自定义扩展
│   │   └── types.ts              # 类型定义
│   ├── LinkIndexService.ts       # 链接索引服务
│   ├── LinkParser.ts             # WikiLink 解析器
│   └── ...                       # 其他模块
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── lib.rs                # 核心逻辑
│   │   └── commands/             # 自定义命令
│   ├── Cargo.toml                # Rust 依赖
│   └── tauri.conf.json           # Tauri 配置
├── docs/                         # 技术文档
├── website/                      # MkDocs 文档站点
├── .github/workflows/            # CI/CD 配置
└── package.json                  # 前端依赖
```

### TypeScript 配置

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

---

## 已知问题与经验教训

### 1. Tiptap v3 + React 19 兼容性问题

**问题**：`@tiptap/extensions` v3.27.1 的 Focus 扩展在 React 19 渲染时序下，`this.editor` 可能为 undefined。

**解决方案**：使用 `immediatelyRender: false` 让编辑器在 `useEffect` 中创建。

### 2. Vite 预构建缓存

**问题**：直接修改 `node_modules` 中的文件不会被 Vite 加载。

**解决方案**：使用 `patch-package` 或 Vite `resolve.alias`。

### 3. ProseMirror 插件内部错误

**问题**：错误发生在 ProseMirror 的 `Plugin.apply` 调用链中，上层 try-catch 无法拦截。

**解决方案**：在插件层面修复，不能依赖上层防御性代码。

---

## 附录

### CSS 文件清单

| 文件 | 用途 |
|------|------|
| `src/themes.css` | CSS 变量定义 8 种主题 |
| `src/App.css` | 主布局样式 |
| `src/Sidebar.css` | 侧栏/文件树/右键菜单 |
| `src/Editor/theme.css` | TipTap 编辑器样式 |
| `src/Settings.css` | 设置面板样式 |
| `src/PublishPanel.css` | 发布面板样式 |
| `src/GraphView.css` | 知识图谱样式 |
| `src/MindmapView.css` | 思维导图样式 |
| `src/WikiLink.css` | WikiLink 样式 |
| `src/BacklinksPanel.css` | 反向链接面板样式 |
| `src/FilePreview.css` | 文件预览样式 |

### 有用的链接

- [Tauri v2 文档](https://tauri.app/v2/)
- [TipTap 文档](https://tiptap.dev/)
- [CodeMirror 文档](https://codemirror.net/)
- [React 19 文档](https://react.dev/)
