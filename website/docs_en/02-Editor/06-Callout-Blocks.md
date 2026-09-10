---
title: Callout Blocks
tags: [editor]
---

# Callout Blocks

Callouts (admonition blocks) come from GitHub's alert syntax and are a great tool for structured notes. Tydora supports **15** built-in types, each with its own icon and color scheme, to help you highlight important content and distinguish levels of information.

> [!NOTE] Callouts render as colored cards in live preview mode, and as blockquotes with `[!TYPE]` in source mode. The content is identical in both.

## Basic Syntax

Callouts extend the blockquote: put `[!type]` immediately after `>`:

```markdown
> [!NOTE]
> This is the callout content
```

## Type List

| Type | Syntax | Purpose |
| --- | --- | --- |
| NOTE | `[!NOTE]` | A general note |
| TIP | `[!TIP]` | A tip or suggestion |
| IMPORTANT | `[!IMPORTANT]` | Important information |
| WARNING | `[!WARNING]` | A warning |
| CAUTION | `[!CAUTION]` | Something to be careful about |
| ABSTRACT | `[!ABSTRACT]` | A summary or abstract |
| INFO | `[!INFO]` | Informational |
| SUCCESS | `[!SUCCESS]` | Success or positive news |
| QUESTION | `[!QUESTION]` | A question |
| FAILURE | `[!FAILURE]` | A failure or error |
| DANGER | `[!DANGER]` | A danger warning |
| BUG | `[!BUG]` | Bug-related |
| EXAMPLE | `[!EXAMPLE]` | An example |
| QUOTE | `[!QUOTE]` | Quoted content |
| FAQ | `[!FAQ]` | Frequently asked questions |

## Collapse Control

Use the `+` / `-` modifiers to control the default expanded state:

```markdown
> [!NOTE]+      → expanded by default
> [!NOTE]-      → collapsed by default
> [!NOTE]       → expanded by default (same as +)
```

Click the title bar to expand or collapse at any time; when collapsed, only the title remains.

## Examples

```markdown
> [!TIP]
> Press `Ctrl+S` to save the current file quickly.

> [!WARNING]
> Deleting a file cannot be undone — please be careful.

> [!FAQ]-
> **Q: How do I switch editing modes?**
> Press `Ctrl+/` to switch between IR / SV.
```

Rendered:

> [!TIP] Press `Ctrl+S` to save the current file quickly.

> [!WARNING] Deleting a file cannot be undone — please be careful.

> [!FAQ]- **Q: How do I switch editing modes?** Press `Ctrl+/` to switch between IR / SV.

## Multiple Paragraphs and Nesting

A callout supports standard Markdown elements inside it — multiple paragraphs, lists, code blocks, and more:

````markdown
> [!EXAMPLE]
> Here is a code sample:
> ```js
> console.log("hello");
> ```
> It can also contain a list:
> - Item one
> - Item two
````

> [!TIP] In live preview mode, with the cursor inside a callout you can use the "Quote" command in the [[02-Editor/09-Context-Menu]] to switch between a plain blockquote and a callout.

## Related Documents

- [[02-Editor/02-Markdown-Syntax]] — Complete syntax support
- [[02-Editor/01-Editing-Modes]] — Introduction to editing modes
- [[02-Editor/09-Context-Menu]] — Right-click formatting commands
