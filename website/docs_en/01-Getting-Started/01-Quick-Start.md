---
title: Quick Start
tags: [getting-started]
---

# Quick Start

Tydora is a modern desktop Markdown editor built on Tauri v2 + React 19. It supports WYSIWYG live preview, dual-mode (live preview / source) editing, WikiLink bidirectional links, tags and bookmarks, a knowledge graph, mind maps, a whiteboard canvas, a built-in terminal, and multi-format export. This page takes you from installation to your first note in about 5 minutes.

> [!NOTE] If you already use Obsidian or Typora, much of Tydora will feel familiar: the vault concept, the `[[...]]` link syntax, and live-preview editing all come from the same lineage.

## 1. Installation

Open the [GitHub Releases](https://github.com/zuorn/Tydora/releases) page.

1. Download the installer for your system:
   - **Windows**: `Tydora_x.x.x_x64-setup.exe` (also available from the Microsoft Store)
   - **macOS**: `Tydora_aarch64.dmg` (Apple silicon) or `Tydora_x64.dmg` (Intel)
   - **Linux**: `Tydora_amd64.AppImage`
2. Run the installer and follow the prompts.
3. Launch Tydora.

> [!TIP] After the first launch, Tydora checks for available updates in the background (see "Check for Updates" in [[01-Getting-Started/02-About]]). You can also check manually any time from the "About" tab in Settings.

## 2. Open a Vault

Tydora uses the "vault" concept to manage your notes. **Each vault is a folder on your disk.** Every Markdown file and canvas file inside it is picked up by the file tree, the link index, the tag index, and the knowledge graph.

1. Click the **vault switcher** at the bottom of the left sidebar (it shows the current vault name).
2. Choose "Manage Vaults" or "Add Vault".
3. In the system file picker, choose a folder to be your note vault (you can also create an empty folder).
4. After you confirm, the left sidebar immediately shows that folder's **file tree**.

> [!ABSTRACT] A vault only records a folder path — Tydora never moves or copies your files. You can add multiple vaults at any time and organize them by project or topic. See [[04-File-Management/01-Vaults]].

## 3. Create Your First Note

1. In the left **file tree**, right-click the target folder (or the root).
2. Choose "New File".
3. Type a filename, e.g. `my-first-note.md` (the `.md` extension is optional — Tydora adds it for you).
4. Press `Enter` to confirm, and the editor opens the file.
5. Start writing in Markdown!

> [!TIP] You can also right-click empty space in the file tree to "New Folder" or "New Canvas". Sort your notes into folders first so your knowledge doesn't turn into a tangle.

## 4. Basic Editing

Tydora offers two editing modes for different situations:

- **Live preview (IR / WYSIWYG)**: you see the final rendered result directly in the editor. Best for everyday writing.
- **Source mode (SV)**: shows plain Markdown text with syntax highlighting from CodeMirror 6. Best for fine-grained formatting.

> Press `Ctrl+/` to switch between the two at any time. See [[02-Editor/01-Editing-Modes]].

If you are used to Vim keybindings, you can enable Vim support from the "Vim Mode" tab in Settings (off by default). See [[02-Editor/11-Vim-Mode]].

## 5. Saving Files

- Manual save: press `Ctrl+S`.
- Auto-save: **enabled by default**. The file is written to disk about 1 second after you stop typing. You can turn it off in the "Behavior" group of [[07-Settings/01-General-Settings]].

> [!WARNING] Deleting a file is irreversible — it does not go to the system recycle bin. Back up important notes, or keep them under version control (e.g. Git).

## 6. Quick Navigation

These shortcuts will noticeably speed up your work:

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` | [[05-Navigation-Search/01-Quick-Open]] a file |
| `Ctrl+P` | [[05-Navigation-Search/02-Command-Palette]] — search and run commands |
| `Ctrl+Tab` | Toggle the left sidebar |
| `Ctrl+/` | Switch editing mode (IR ↔ SV) |
| `Ctrl+G` | Open the [[03-Knowledge-Management/04-Knowledge-Graph]] |
| `Ctrl+M` | Open the [[08-Advanced-Features/02-Mind-Map]] |
| `Ctrl+F` / `Ctrl+H` | [[02-Editor/12-Find-and-Replace]] |
| `Ctrl+\` / `Ctrl+-` | Horizontal / vertical split |
| ``Ctrl+` `` | Open the [[08-Advanced-Features/05-Terminal]] |

> Full list: [[07-Settings/04-Shortcut-Reference]].

## 7. Next Steps

Once your first note is written, explore further:

- Use `[[Another Note]]` to create bidirectional links and connect notes → [[03-Knowledge-Management/01-Wiki-Links]]
- Use `#tag` to tag notes, then browse the tag graph in the sidebar "Tags" tab → [[03-Knowledge-Management/06-Tags]]
- Bookmark frequently used files for one-click access → [[03-Knowledge-Management/07-Bookmarks]]
- Press `Ctrl+G` to see what your knowledge graph looks like → [[03-Knowledge-Management/04-Knowledge-Graph]]
- Want to share? Export to PDF / Word, or publish as a website → [[08-Advanced-Features/04-Export-and-Copy]], [[08-Advanced-Features/01-Publish-Website]]

## Related Documents

- [[04-File-Management/01-Vaults]] — Vault (multi-folder) management
- [[02-Editor/01-Editing-Modes]] — Editing modes in detail
- [[07-Settings/04-Shortcut-Reference]] — All keyboard shortcuts
- [[07-Settings/01-General-Settings]] — Auto-save and app settings
- [[01-Getting-Started/03-FAQ]] — Beginner FAQ
