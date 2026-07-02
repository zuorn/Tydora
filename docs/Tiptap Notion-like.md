# Tiptap Notion-like 编辑器研究总结与实现方案评估

---

## 第一部分：Tiptap 技术总结

### 1. Tiptap 是什么

Tiptap 是一个**无头（headless）富文本编辑器框架**，构建在 ProseMirror 之上。它提供了一套现代化的、与框架无关的 API，通过扩展（Extensions）、事件（Events）和命令（Commands）三大核心概念来构建编辑器。

### 2. 核心架构

#### 2.1 Schema 驱动
Tiptap 基于 ProseMirror 的 Schema 系统，严格定义文档结构：
- **Nodes（节点）**：块级元素（段落、标题、代码块、表格等）
- **Marks（标记）**：行内格式（加粗、斜体、链接等）
- Schema 严格校验：不在 schema 中的 HTML 元素/属性会被丢弃

#### 2.2 Extensions（扩展系统）
扩展是 Tiptap 的核心能力单元，分为三类：
- **Nodes**：定义文档中的节点类型（如 Image、Table、Mention）
- **Marks**：定义文本标记（如 Bold、Link、Highlight）
- **Functionality**：功能扩展（如 DragHandle、FileHandler、Undo/Redo）

#### 2.3 StarterKit
内置的扩展集合，包含常用功能：
- **Nodes**: Blockquote, BulletList, CodeBlock, Document, HardBreak, Heading, HorizontalRule, ListItem, OrderedList, Paragraph, Text
- **Marks**: Bold, Code, Italic, Link, Strike, Underline
- **Extensions**: Dropcursor, Gapcursor, Undo/Redo, ListKeymap, TrailingNode

### 3. React 集成

```tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

const Editor = () => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Hello World!</p>',
  })
  return <EditorContent editor={editor} />
}
```

关键 API：
- `useEditor()` — 创建编辑器实例
- `EditorContent` — 渲染编辑器内容
- `EditorContext` — 跨组件共享编辑器状态
- `useEditorState()` — 响应式获取编辑器状态（不触发重渲染）
- `FloatingMenu` / `BubbleMenu` — 浮动/气泡菜单

### 4. 事件系统

| 事件 | 说明 |
|------|------|
| `onCreate` | 编辑器初始化完成 |
| `onUpdate` | 内容变化 |
| `onSelectionUpdate` | 选区变化 |
| `onTransaction` | 任何状态变化 |
| `onFocus` / `onBlur` | 焦点变化 |
| `onPaste` / `onDrop` | 粘贴/拖放 |
| `onDelete` | 内容删除 |
| `onContentError` | 内容与 schema 不匹配 |

### 5. 命令系统

支持链式调用：
```js
editor.chain().focus().toggleBold().run()
```
支持 dry-run 检查：`editor.can().toggleBold()`
支持 first-match：`editor.commands.first([...])`

### 6. Notion-like 模板功能清单

Tiptap 官方 Notion-like 模板包含：

| 功能类别 | 具体功能 |
|----------|----------|
| **核心编辑** | 段落、标题(H1-H6)、引用、代码块、分割线 |
| **列表** | 无序列表、有序列表、任务列表 |
| **格式** | 加粗、斜体、下划线、删除线、高亮、颜色、上标/下标 |
| **媒体** | 图片（拖放上传）、链接（内联预览） |
| **表格** | 完整表格支持（增删行列、合并、调整大小） |
| **交互** | Slash 命令菜单、浮动工具栏、拖拽手柄、右键菜单 |
| **高级** | Mention(@提及)、Emoji、数学公式、唯一ID |
| **协作** | 实时协作、光标显示、用户在线状态 |
| **AI** | 内联 AI 辅助写作 |
| **UI** | 深色/浅色模式、响应式设计、撤销/重做 |

### 7. 关键扩展详解

#### 7.1 DragHandle（拖拽手柄）
- 支持块级拖拽排序
- 可嵌套（nested）模式支持列表内拖拽
- 基于 scoring system 的智能节点选择
- 自定义 rules 控制拖拽行为

#### 7.2 Suggestion（建议工具）
- 支持 `@` 触发 Mention
- 支持自定义触发字符
- 内置 Floating UI 定位
- 支持异步数据获取（带 debounce 和 AbortSignal）
- 支持 managed positioning（自动定位）和 manual positioning

#### 7.3 FileHandler（文件处理）
- 处理文件拖放和粘贴
- 自定义 onPaste / onDrop 回调
- 文件类型过滤（allowedMimeTypes）
- 与 Image 扩展配合使用

#### 7.4 Image（图片）
- 支持 inline 模式
- 支持 resize（可调大小）
- 支持 base64
- 需配合 FileHandler 实现上传

#### 7.5 Mention（提及）
- `@` 触发自动补全
- 自定义渲染组件
- 支持多触发字符（@ 和 #）
- 协作环境下防误触

### 8. UI Components 系统

Tiptap 提供可安装的 UI 组件（通过 CLI 复制到项目中）：

| 组件 | 说明 |
|------|------|
| `slash-dropdown-menu` | Slash 命令菜单 |
| `heading-button` / `heading-dropdown-menu` | 标题选择 |
| `list-button` / `list-dropdown-menu` | 列表操作 |
| `color-highlight-button` | 颜色/高亮 |
| `link-popover` | 链接编辑 |
| `image-upload-button` | 图片上传 |
| `drag-context-menu` | 拖拽右键菜单 |
| `emoji-dropdown-menu` | Emoji 选择 |
| `mention-dropdown-menu` | Mention 菜单 |
| `text-align-button` | 文本对齐 |
| `turn-into-dropdown` | 块类型转换 |
| `undo-redo-button` | 撤销/重做 |

### 9. 许可证说明

- **开源扩展**（MIT）：Bold、Heading、Image、Table 等核心扩展
- **Pro 扩展**（付费）：Comments、Version History、AI 等高级功能
- **Notion-like 模板**：需要 Start plan 订阅才能用于生产环境
- **UI Components**：开源组件 MIT，Cloud 相关组件需订阅

---

## 第二部分：当前项目分析

### 1. 项目现状

Tydora 已经在使用 Tiptap v3.27.1，当前编辑器实现：

**已安装的 Tiptap 包：**
- `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`
- `@tiptap/starter-kit`
- `@tiptap/extension-code-block-lowlight`（代码高亮）
- `@tiptap/extension-highlight`（高亮）
- `@tiptap/extension-image`（图片）
- `@tiptap/extension-link`（链接）
- `@tiptap/extension-placeholder`（占位符）
- `@tiptap/extension-table` + cell/header/row（表格）
- `@tiptap/extension-task-item` + task-list（任务列表）
- `@tiptap/extension-typography`（排版）
- `tiptap-markdown`（Markdown 序列化）

**自定义扩展：**
- `WikiLink` — Obsidian 风格的 `[[wiki-link]]` 支持
- `SearchHighlight` — 搜索高亮
- `CodeBlockToolbar` — 代码块工具栏

### 2. 当前编辑器架构

```
App.tsx
  └─ TipTapEditor.tsx（主编辑器组件）
       ├─ useEditor() — Tiptap 编辑器实例
       ├─ StarterKit + 20+ 扩展
       ├─ Markdown 双向转换（tiptap-markdown）
       ├─ 自定义快捷键系统（shortcuts.ts）
       ├─ 右键菜单（ContextMenu.tsx）
       └─ SourceEditor（源码模式，CodeMirror）
```

### 3. 编辑器模式

当前支持两种模式：
- **IR（即时渲染）**：Tiptap WYSIWYG 模式
- **SV（源码）**：CodeMirror 源码编辑

---

## 第三部分：Notion-like 编辑器实现方案评估

### 方案 A：基于现有 Tiptap 扩展增强（推荐）

**思路**：在当前 Tiptap 基础上，逐步添加 Notion-like 交互特性，不改变底层架构。

#### 需要新增的功能模块

| 优先级 | 功能 | 实现方式 | 复杂度 |
|--------|------|----------|--------|
| P0 | Slash 命令菜单 | `@tiptap/suggestion` + 自定义 React 组件 | 中 |
| P0 | 浮动工具栏（Bubble Menu） | Tiptap 内置 `BubbleMenu` | 低 |
| P0 | 拖拽手柄 | `@tiptap/extension-drag-handle`（Pro 扩展）或自定义 | 中-高 |
| P1 | 块级拖拽排序 | DragHandle 扩展 + 自定义 drop logic | 中 |
| P1 | 右键上下文菜单增强 | 现有 ContextMenu 扩展 | 低 |
| P1 | 文本对齐 | `@tiptap/extension-text-align` | 低 |
| P2 | @Mention | `@tiptap/extension-mention` + suggestion | 中 |
| P2 | Emoji 选择器 | 自定义 suggestion 或第三方库 | 中 |
| P2 | 图片拖放上传增强 | `@tiptap/extension-file-handler` | 低 |
| P3 | 块类型转换菜单 | 自定义 TurnInto 扩展 | 中 |
| P3 | AI 辅助 | 需要 Tiptap Cloud 或自建 | 高 |

#### Slash 命令菜单实现方案

```tsx
// 核心思路：使用 Suggestion 工具
import Suggestion from '@tiptap/suggestion'

// 1. 创建 SlashCommand 扩展
const SlashCommand = Node.create({
  name: 'slashCommand',
  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: true,
        items: ({ query }) => {
          // 返回命令列表：标题、列表、引用、代码块、图片等
          return commands.filter(cmd => 
            cmd.title.toLowerCase().includes(query.toLowerCase())
          )
        },
        render: () => {
          // React 渲染浮动菜单
          // 使用 props.mount() 自动定位
        }
      }
    }
  },
  addProseMirrorPlugins() {
    return [Suggestion(this.options.suggestion)]
  }
})
```

#### 浮动工具栏方案

```tsx
// Tiptap 内置 BubbleMenu
<BubbleMenu editor={editor} tippyOptions={{ duration: 100 }}>
  <button onClick={() => editor.chain().focus().toggleBold().run()}>
    Bold
  </button>
  {/* 更多格式按钮 */}
</BubbleMenu>
```

#### 拖拽手柄方案

**选项 1：使用 Pro 扩展 `@tiptap/extension-drag-handle`**
- 优点：功能完善，支持 nested 模式，智能节点选择
- 缺点：需要 Tiptap Cloud 订阅

**选项 2：自定义实现**
- 基于 ProseMirror 的 NodeSelection 和 drop 事件
- 需要实现：手柄 UI、拖拽逻辑、drop position 计算
- 复杂度较高但完全可控

### 方案 B：使用 Tiptap UI Components（需评估兼容性）

**思路**：通过 CLI 安装 Tiptap 官方 UI 组件。

```bash
npx @tiptap/cli@latest add notion-like-editor
```

**优点**：
- 官方维护，功能完整
- 组件化设计，可定制

**缺点**：
- React 19 兼容性尚未完全支持（官方说明）
- Notion-like 模板需要付费订阅
- 会引入大量可能不需要的代码
- 与现有自定义扩展（WikiLink 等）可能冲突

### 方案 C：完全替换为 Notion-like 模板

**思路**：使用官方模板替换当前编辑器。

**优点**：功能最完整
**缺点**：
- 需要 Tiptap Cloud 服务（协作、AI）
- 需要付费订阅
- 与现有 vault 系统、WikiLink 等深度集成冲突
- 迁移成本极高

---

## 第四部分：推荐方案与实施路径

### 推荐方案：方案 A（渐进式增强）

**理由**：
1. 项目已有成熟的 Tiptap 基础，无需从头开始
2. 自定义扩展（WikiLink、SearchHighlight）需要保留
3. Markdown 双向转换（tiptap-markdown）是核心功能
4. 不依赖 Tiptap Cloud 服务
5. 可以按优先级逐步实施

### 分阶段实施计划

#### Phase 1：基础交互 ✅ 已完成
- [x] 添加 `@tiptap/suggestion` 依赖
- [x] 实现 Slash 命令菜单（`/` 触发）
  - 标题（H1-H6）
  - 列表（无序/有序/任务）
  - 引用
  - 代码块
  - 表格
  - 分割线
  - 图片
- [x] 添加选择浮动工具栏（SelectionToolbar）
  - 加粗、斜体、删除线、行内代码
  - 链接
  - 高亮

#### Phase 2：块级操作 ✅ 已完成
- [x] 实现块级拖拽手柄（自定义实现）
  - 基于 ProseMirror 事件系统
  - 手柄 UI（hover 显示，点击触发拖拽）
  - Drop position 计算
  - 块级排序逻辑
- [x] 增强右键菜单
  - 块类型转换（Turn Into）子菜单
  - 对齐方式子菜单
  - 标题、插入子菜单
- [x] 添加文本对齐支持（@tiptap/extension-text-align）

#### Phase 3：高级功能 ✅ 已完成
- [x] 图片拖放上传增强
  - 使用 `@tiptap/extension-file-handler`
  - 与现有 ImageManager 集成
- [x] 块级引用样式增强（背景色、圆角）

#### Phase 4：优化与打磨 ✅ 已完成
- [x] 样式优化（Slash 命令菜单、选择工具栏、拖拽手柄）
- [x] 构建验证通过

### 用户决策确认

| 决策项 | 选择 |
|--------|------|
| 拖拽手柄 | 自定义实现（免费方案） |
| 协作功能 | 当前不需要，架构预留扩展能力 |
| Slash 命令范围 | 标题(H1-H6)、列表、引用和代码块、表格、图片和媒体 |

### 关键文件修改清单

| 文件 | 修改内容 |
|------|----------|
| `package.json` | 添加 `@tiptap/suggestion`, `@tiptap/extension-text-align` 等依赖 |
| `src/Editor/TipTapEditor.tsx` | 添加新扩展、BubbleMenu、Slash 命令 |
| `src/Editor/extensions/` | 新增 `slash-command.ts`, `bubble-menu.tsx` 等 |
| `src/Editor/ContextMenu.tsx` | 增强右键菜单功能 |
| `src/Editor/theme.css` | 添加 Notion-like 样式 |
| `src/App.tsx` | 适配新的编辑器 API |

### 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| DragHandle Pro 扩展需付费 | 高 | 选择自定义实现方案 |
| React 19 兼容性 | 中 | 测试后决定是否降级 |
| Markdown 序列化兼容 | 高 | 确保 tiptap-markdown 与新扩展兼容 |
| 性能影响 | 中 | 代码分割、按需加载 |
| 与现有 WikiLink 冲突 | 中 | 充分测试集成 |

---

## 第五部分：结论

Tiptap 提供了强大的扩展系统和 React 集成，非常适合构建 Notion-like 编辑器。当前项目已经具备良好的 Tiptap 基础，通过渐进式增强可以在 4-8 周内实现核心的 Notion-like 交互体验。

**关键决策点**：
1. 拖拽手柄：自定义实现（免费）vs Pro 扩展（付费）
2. Slash 命令：完全自定义 vs 使用 UI Components
3. 协作功能：是否需要实时协作（影响架构选择）

建议从 Phase 1 开始，先实现 Slash 命令和浮动工具栏，这两个功能对用户体验提升最大且实现成本可控。
