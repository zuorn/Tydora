---
title: File Preview
tags: [file-management]
---

# File Preview

Beyond Markdown, Tydora can preview a wide range of image, video, audio, and PDF files, so you can inspect assets without leaving the app.

## Supported Formats

### Images

JPG, JPEG, PNG, GIF, WebP, BMP, ICO, SVG, AVIF, HEIC, HEIF

### Video

MP4, WebM, OGG, MOV, AVI, MKV, WMV, FLV, M4V

### Audio

MP3, WAV, OGG, FLAC, AAC, M4A, WMA

### Documents

PDF

> [!NOTE]
> Other types show "Cannot preview this file type" and offer to open them with an external program.

## How to Preview

- **Click** a non-Markdown file in the file tree and its preview opens in the main area.
- `.canvas` whiteboard files are not taken over by the preview — they open the whiteboard editor directly (see [[08-Advanced-Features/03-Whiteboard-Canvas]]).
- Images embedded in a note via `![[image.png]]` are shown inline in the body (see [[03-Knowledge-Management/02-Embedded-Content]]).

## Image Preview

- **Scroll to zoom**: the zoom ratio is bounded to 10% – 500%
- **Zoom readout**: the current percentage is shown in the top-right corner
- **Reset zoom**: back to 100% in one click
- **Back**: the "◀ Back" button in the top-left closes the preview
- Transparent backgrounds are supported (PNG / WebP / SVG)

## Video Preview

Uses the built-in player (`<video>`):

- Play / pause, seek, volume control
- Supports codecs the browser supports natively; unsupported codecs report a load failure

## Audio Preview

Uses the built-in player (`<audio>`): play / pause and seek control.

## PDF Preview

Loads PDFs inline, with direct page navigation and zoom. Useful for consulting reference material next to your notes.

> [!NOTE]
> Where images are stored and how they are named is configurable in [[07-Settings/06-Image-Settings]].

## Related Documents

- [[04-File-Management/02-File-Tree]] — File tree operations
- [[04-File-Management/03-File-Operations]] — File management
- [[03-Knowledge-Management/02-Embedded-Content]] — Embedding images
- [[07-Settings/06-Image-Settings]] — Image storage settings
