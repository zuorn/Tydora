---
title: Frontmatter (Metadata)
tags: [editor]
---

# Frontmatter (Metadata)

Frontmatter is a YAML metadata block at the **very beginning** of a Markdown file, delimited by `---`. It doesn't appear in the rendered body, but it adds structured information to a note: title, tags, date, publish status, and more.

> [!NOTE] In live preview mode, Frontmatter renders as an **editable block with YAML syntax highlighting** (with a `METADATA` label bar on top), where you can add, change, or remove keys directly. In source mode it is simply plain YAML text.

## Basic Syntax

Start on the first line of the file and wrap the YAML in `---`:

```yaml
---
title: My note title
tags: [tag1, tag2]
date: 2024-01-01
---
```

The body content follows afterwards.

## Supported Properties

| Property | Type | Description |
| --- | --- | --- |
| `title` | string | Document title (overrides the filename display) |
| `tags` | string\[\] | Tag list, e.g. `[reading, tech]`; joins the tag index |
| `date` | string | Creation date; `YYYY-MM-DD` recommended |
| `publish` | string | Publish status; `public` allows the note to be included in "public notes only" mode |
| `author` | string | Author |
| `description` | string | Document description (used for SEO on published sites) |

> [!TIP] Tags declared in `tags` behave exactly like `#tag` written in the body — both enter the tag index and can be browsed and filtered from the sidebar "Tags" tab. See [[03-Knowledge-Management/06-Tags]].

## Editing in the Editor

### Live Preview Mode

Frontmatter appears as a highlighted block at the top of the editor:

- A `METADATA` label bar on top distinguishes it from other content
- Inside is **plain YAML text** with syntax highlighting (keys, strings, numbers, and booleans are colored separately)
- Click to edit directly; add or remove keys line by line, with no need to switch to source mode

> [!NOTE] That block is a plain text editing area — it does not provide "key/value form" field controls. You write the key names and YAML syntax yourself.

### Source Mode

Simply edit the `---` block at the top of the file.

## Publish Control

The `publish` property in Frontmatter determines whether a note participates in the "public notes only" publish mode:

```yaml
---
title: A public note
publish: public
---
```

- Set to `publish: public` → included in "public notes only" mode
- Absent or any other value → included only in "full publish" mode

> For the difference between publish modes, see [[08-Advanced-Features/01-Publish-Website]].

## Writing Rules

- Frontmatter **must be at the very beginning of the file**, with no characters before it (not even a blank line)
- Start with `---` and end with `---`
- Follow standard YAML: strings may be quoted, arrays use `[ ]`, numbers and booleans are supported
- Property names are **case-sensitive** (lowercase is recommended)

> [!WARNING] If the YAML is malformed (a missing closing `---`, broken indentation), Frontmatter may not parse correctly and the rendered block will look wrong.

## Related Documents

- [[02-Editor/02-Markdown-Syntax]] — Complete syntax support
- [[02-Editor/01-Editing-Modes]] — Introduction to editing modes
- [[08-Advanced-Features/01-Publish-Website]] — Publishing and the `publish` property
