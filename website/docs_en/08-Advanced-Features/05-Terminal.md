---
title: Terminal
tags: [features]
---

# Terminal

Tydora includes a **real terminal**, rendered with xterm.js and backed by a PTY session created on the Rust side. It is not a read-only command echo — you can run interactive programs in it, run commands while writing notes, and watch build output.

> [!NOTE]
> The terminal exists as an **editor pane**, not a separate window. Shortcut: ``Ctrl+` `` to create a terminal pane.

## Opening the Terminal

| Entry point | Description |
| --- | --- |
| ``Ctrl+` `` | Create a new terminal pane |
| File tree right-click → "Open in terminal" | Open a terminal in that file's directory |
| Command Palette (`Ctrl+P`) → "New terminal" | Same as the shortcut |
| Editor "More" menu → "New terminal" | Same as the shortcut |

## Which Shell Is Used

Tydora auto-detects the shells available on your system:

| Platform | Rule |
| --- | --- |
| Windows | Prefers `pwsh.exe` (PowerShell 7+), falling back to `cmd.exe` |
| macOS / Linux | Uses the `$SHELL` environment variable, falling back to `bash` |

> [!NOTE]
> Terminal sessions use your machine's shell; their permissions and behavior are the same as operating in your system terminal directly.

## Interface Capabilities

| Capability | Description |
| --- | --- |
| Real interaction | Supports interactive programs that need a TTY (pagers, progress bars, colored output, etc.) |
| Smart title | Parses the running command and working directory from the shell's OSC escape sequences and shows them in the pane title |
| Find | Find text in the terminal, with previous / next, case sensitivity, and a no-match notice |
| Context menu | Copy, paste, find, split pane (horizontal / vertical), close tab |
| Font zoom | Hold `Ctrl` and scroll the mouse wheel inside the terminal to zoom |

## Splits and Layout

The terminal participates in the editing area's split layout:

- Side by side with editor panes (`Ctrl+\` horizontal, `Ctrl+-` vertical)
- Terminals can be split among themselves
- Drag the divider between panes to resize
- Each terminal pane has its **own independent shell session**

> [!NOTE]
> Currently each pane corresponds to one session — there is no "multiple tabs" concept; when you need several sessions, open several terminal panes. See [[05-Navigation-Search/04-Split-and-Panes]].

## Terminal Settings

Configure in the "Terminal" tab of [[07-Settings/08-Terminal-Settings]]:

| Setting | Description |
| --- | --- |
| Color scheme | "Auto" follows the app theme; 11 presets are also available (Campbell, Solarized, Dracula, Retro, etc.) |
| Font | A preset monospace font or a custom CSS `font-family` |
| Font size | 8 – 40, default 13 |

> [!TIP]
> After you change these settings, already-open terminals **hot-update** their colors and font size — no need to reopen them.

## Use Cases

- Run `git status` / `git commit` inside your notes directory
- Use build tools on assets in your notes (image compression, format conversion)
- Run `npm` / `cargo` and other commands while watching output in real time
- Combined with [[08-Advanced-Features/04-Export-and-Copy]], paste command output straight into a note

## Related Documents

- [[07-Settings/08-Terminal-Settings]] — Colors, font, and font size
- [[05-Navigation-Search/04-Split-and-Panes]] — Splits and pane management
- [[04-File-Management/03-File-Operations]] — Opening in the terminal
- [[01-Getting-Started/Privacy-Policy]] — Privacy boundaries for terminal sessions
