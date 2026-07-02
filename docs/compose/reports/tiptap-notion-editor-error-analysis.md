# Notion-like 编辑器改造：错误分析报告

## 一、项目背景

在 Tydora（基于 Tauri v2 + React 19 + Tiptap v3 的 Markdown 编辑器）上实现 Notion-like 编辑器功能，包括：
- Slash 命令菜单（`/` 触发）
- 选择浮动工具栏
- 拖拽手柄
- 右键菜单增强
- 文本对齐支持

## 二、遇到的核心错误

```
TypeError: Cannot destructure property 'isEditable' of 'editor' as it is undefined.
    at Plugin.apply (state.ts:71:15)
    at _EditorState.applyInner (index.js:836:45)
    at _EditorState.applyTransaction (index.js:796:45)
    at Editor.dispatchTransaction (Editor.ts:642:48)
    at EditorView.dispatch (index.js:5870:29)
    at Object.method [as setContent] (CommandManager.ts:46:18)
```

该错误导致 React ErrorBoundary 触发，编辑器完全无法渲染。

## 三、根因分析

### 3.1 错误来源

`@tiptap/extensions` v3.27.1 包中包含一个 `Focus` 扩展（用于给聚焦节点添加 CSS class）。该扩展的 ProseMirror 插件在 `decorations` 属性中执行以下代码：

```typescript
// @tiptap/extensions/src/focus/focus.ts 第 46 行
const { isEditable, isFocused } = this.editor
```

当 `this.editor` 为 `undefined` 时，解构操作直接抛出异常。

### 3.2 为什么会触发

依赖链如下：

```
@tiptap/extension-placeholder (v3.27.1)
  └── import { Placeholder } from '@tiptap/extensions'  // re-export
        └── export * from './focus/index.js'             // barrel export 包含 Focus
```

`@tiptap/extension-placeholder` 源码直接 re-export 自 `@tiptap/extensions`，而 `@tiptap/extensions` 的 barrel export (`index.ts`) 包含 `export * from './focus/index.js'`。Vite 构建时将 Focus 扩展代码打包进产物。

### 3.3 触发路径

```
App 挂载
  → useEffect([sidebarOpen]) 触发 notifyResize()
    → editorHandleRef.current.resize()
      → editor.commands.focus()
        → EditorView.dispatch(transaction)
          → Editor.dispatchTransaction()
            → Plugin.apply()  // Focus 插件的 decorations 被调用
              → this.editor.isEditable  // 💥 this.editor 是 undefined
```

### 3.4 React 19 时序问题

Tiptap v3 的 `useEditor` 默认 `immediatelyRender: true`。在 React 19 的渲染模式下，编辑器的扩展初始化与视图挂载之间存在时序差异，导致插件在 `bindEditor` 完成前就被 ProseMirror 状态层调用。

## 四、尝试过的修复方案（全部失败）

### 方案 1：SafeFocus 同名覆盖
- **做法**：创建同名 `focus` 扩展，添加 `if (!ext.editor) return DecorationSet.empty` 防护
- **结果**：Tiptap 不支持同名扩展覆盖，原始 Focus 插件仍被注册
- **失败原因**：Tiptap ExtensionManager 不做去重，两个同名扩展的插件都会被注册

### 方案 2：Placeholder 导入路径替换
- **做法**：`import { Placeholder } from "@tiptap/extensions"` 替代 `@tiptap/extension-placeholder`
- **结果**：仍然从 barrel export 导入，Focus 仍被打包
- **失败原因**：直接从 `@tiptap/extensions` 导入同样触发 barrel export

### 方案 3：Vite alias 替换 Focus 模块
- **做法**：在 `vite.config.ts` 中用 `resolveId` + `load` 虚拟模块替换 Focus
- **结果**：Focus 代码内联在 `@tiptap/extensions/dist/index.js` 中，不是独立模块
- **失败原因**：Vite alias 只能替换模块导入，无法替换内联代码

### 方案 4：直接 patch node_modules 源文件
- **做法**：修改 `@tiptap/extensions/dist/index.js` 和 `src/focus/focus.ts`
- **结果**：Vite 预构建缓存覆盖了 patch
- **失败原因**：Vite dev 模式预构建依赖并缓存在 `node_modules/.vite`，启动时用缓存版本而非我们修改的文件

### 方案 5：postinstall 自动 patch 脚本
- **做法**：`scripts/patch-tiptap-focus.mjs` 在 `npm install` 后自动 patch
- **结果**：Vite 预构建缓存仍然使用旧版本
- **失败原因**：同方案 4，预构建缓存机制导致 patch 不生效

### 方案 6：editorReadyRef + try-catch 防御
- **做法**：添加 `editorReadyRef` 标志和 try-catch 包裹所有 API 方法
- **结果**：错误仍发生，因为问题在 ProseMirror 插件内部，不受我们的 try-catch 控制
- **失败原因**：错误发生在 ProseMirror 状态事务内部，我们的代码无法拦截

### 方案 7：immediatelyRender: false
- **做法**：设置 `useEditor({ immediatelyRender: false })`
- **结果**：改变了初始化时序但未解决根本问题
- **失败原因**：Focus 插件的 `decorations` prop 在任何状态事务中都会被调用

## 五、为什么反复失败的根本原因

1. **Vite 预构建缓存机制**：Vite dev 模式会预构建（pre-bundle）依赖并缓存。对 `node_modules` 的直接修改会被缓存覆盖，导致 patch 不生效。

2. **Barrel Export 污染**：`@tiptap/extensions` 的 barrel export 将 Focus、Selection、Placeholder 等多个扩展打包在一个文件中。即使我们只导入 Placeholder，整个 barrel 都会被加载。

3. **Tiptap 扩展注册机制**：Tiptap 的 ExtensionManager 收集所有扩展的 ProseMirror 插件，不做去重。同名扩展不会覆盖，而是两个都注册。

4. **ProseMirror 内部调用链**：错误发生在 ProseMirror 的 `Plugin.apply` → `EditorState.applyInner` 调用链中，这是框架内部机制，无法通过上层代码的 try-catch 拦截。

## 六、正确的修复方向

### 方案 A：使用 patch-package（推荐）

`patch-package` 会在 `npm install` 后自动应用 `patches/` 目录中的 diff 文件，且不受 Vite 预构建缓存影响（因为它修改的是实际文件，Vite 会在下次启动时重新预构建）。

```bash
npm install patch-package --save-dev
# 手动修改 node_modules/@tiptap/extensions 中的文件
npx patch-package @tiptap/extensions
# 这会在 patches/ 目录生成 diff 文件
```

### 方案 B：避免 barrel import

不从 `@tiptap/extension-placeholder` 导入（它 re-export 自 `@tiptap/extensions` barrel），而是使用子模块路径：

```typescript
// 改前（触发 barrel export 污染）
import Placeholder from "@tiptap/extension-placeholder";

// 改后（只导入 Placeholder，不触发 barrel）
import { Placeholder } from "@tiptap/extensions/placeholder";
```

但需验证 `@tiptap/extensions/placeholder` 的 API 是否与 `@tiptap/extension-placeholder` 完全一致。

### 方案 C：降级 Tiptap 到 v2

回退到 Tiptap v2，该版本不存在此 barrel export 问题。但会丢失 v3 新特性。

### 方案 D：等待 Tiptap 官方修复

该 bug 已在 Tiptap GitHub issues 中被报告。等待官方发布包含修复的版本。

## 七、教训与总结

1. **不要盲目 patch node_modules**：Vite/Webpack 等构建工具有预构建缓存机制，直接修改 `node_modules` 文件不可靠。应使用 `patch-package` 等工具。

2. **Barrel export 是隐形炸弹**：大型库的 barrel export（`export * from ...`）会将整个模块树拉入 bundle，即使只使用其中一个导出。应优先使用子模块路径导入。

3. **Tiptap v3 + React 19 兼容性**：两者组合存在时序问题，扩展初始化与视图挂载之间的竞争条件需要谨慎处理。

4. **调试要先验证基线**：在修改前应先确认原始代码是否正常工作，避免在已有 bug 的基础上叠加改动。

5. **防御性代码不是万能的**：ProseMirror 插件内部的错误无法通过上层 try-catch 拦截，因为它们发生在框架的状态事务处理链中。
