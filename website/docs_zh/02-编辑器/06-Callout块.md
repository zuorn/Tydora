---
title: Callout 提示块
tags: [编辑器]
---

# Callout 提示块

Callout（标注块）源自 GitHub 的告警语法，是结构化笔记的利器。Tydora 支持 **15 种**内置类型，每种都有专属图标与配色，帮助你突出重要内容、区分信息层级。

> [!NOTE]Callout 在即时渲染模式下显示为彩色卡片；在源码模式下显示为带 `[!TYPE]` 的引用块。两种模式内容完全一致。

## 基本语法

Callout 基于引用块扩展，在 `>` 后紧跟 `[!类型]`：

```markdown
> [!NOTE]
> 这是 Callout 的内容
```

## 类型列表

| 类型 | 语法 | 用途 |
| --- | --- | --- |
| NOTE | `[!NOTE]` | 一般性备注 |
| TIP | `[!TIP]` | 小技巧或建议 |
| IMPORTANT | `[!IMPORTANT]` | 重要信息 |
| WARNING | `[!WARNING]` | 警告信息 |
| CAUTION | `[!CAUTION]` | 需要注意的事项 |
| ABSTRACT | `[!ABSTRACT]` | 摘要或概述 |
| INFO | `[!INFO]` | 信息说明 |
| SUCCESS | `[!SUCCESS]` | 成功或正向信息 |
| QUESTION | `[!QUESTION]` | 问题 |
| FAILURE | `[!FAILURE]` | 失败或错误信息 |
| DANGER | `[!DANGER]` | 危险警告 |
| BUG | `[!BUG]` | Bug 相关 |
| EXAMPLE | `[!EXAMPLE]` | 示例 |
| QUOTE | `[!QUOTE]` | 引用内容 |
| FAQ | `[!FAQ]` | 常见问题 |

## 折叠控制

使用 `+` / `-` 修饰符控制 Callout 的默认展开状态：

```markdown
> [!NOTE]+      → 默认展开
> [!NOTE]-      → 默认折叠
> [!NOTE]       → 默认展开（等效于 +）
```

点击标题栏可随时展开 / 折叠，折叠后仅显示标题。

## 使用示例

```markdown
> [!TIP]
> 按 `Ctrl+S` 可以快速保存当前文件。

> [!WARNING]
> 删除文件后无法恢复，请谨慎操作。

> [!FAQ]-
> **Q: 如何切换编辑模式？**
> 按 `Ctrl+/` 可以在 IR / SV 模式间切换。
```

渲染效果：

> [!TIP]按 Ctrl+S 可以快速保存当前文件。

> [!WARNING]删除文件后无法恢复，请谨慎操作。

> [!FAQ]-Q: 如何切换编辑模式？按 Ctrl+/ 可以在 IR / SV 模式间切换。

## 多段落与嵌套

Callout 内部支持多段文字、列表、代码块等标准 Markdown 元素：

````markdown
> [!EXAMPLE]
> 下面是一段示例代码：
> ```js
> console.log("hello");
> ```
> 也可以包含列表：
> - 项目一
> - 项目二
````

> [!TIP]在即时渲染模式下，把光标放进 Callout 后可用 [[02-编辑器/09-右键菜单]] 的「引用」命令切换普通引用与 Callout。

## 相关文档

- [[02-编辑器/02-Markdown语法]] — 完整语法支持
- [[02-编辑器/01-编辑模式]] — 编辑模式介绍
- [[02-编辑器/09-右键菜单]] — 右键格式化命令
