---
title: Image Settings
tags: [settings]
---

# Image Settings

Image settings determine the **storage location and naming rules** for images you paste or drag in, letting you choose freely between "managed with the vault" and "stored centrally."

> [!NOTE]
> Press `Ctrl+,` to open Settings and switch to the "Image" tab.

## Storage Location

### Vault assets directory (default)

Images are saved in the **`assets/` folder under the current vault's root**.

- Pros: images travel with the vault when you manage, move, or back it up, so links rarely break
- Cons: the vault grows as images accumulate

Related option:

| Option | Description |
| --- | --- |
| Auto-create the assets directory | Create the directory if it doesn't exist (on by default) |

### Fixed local directory

Images are saved to a **fixed local directory**, decoupled from any particular vault.

- Pros: multiple vaults can share one image library
- Cons: the path depends on your local environment and may break after switching machines or moving directories

After choosing this mode, specify the directory under "Storage path" (you can pick it with the "Choose directory…" button).

### Image host upload (planned)

Image host mode is **not implemented yet**; Settings shows "Image host upload (planned)" with an explanatory note. For now, use one of the two local storage modes above.

## File Naming Format

Configure the file name generated automatically when pasting an image:

| Format | Example | Description |
| --- | --- | --- |
| Original name | `screenshot.png` | Keep the image's own file name |
| Timestamp | `20240101120000.png` | A unique name based on time |
| Original name + timestamp (default) | `screenshot-20240101120000.png` | Keeps the meaning and avoids duplicates |

> [!TIP]
> For collaboration or provenance, "Original name" is more intuitive; for personal notes the default "Original name + timestamp" avoids same-named images overwriting each other.

## Supported Formats

Pasting and dragging recognize the following image formats:

PNG, JPG / JPEG, GIF, WebP, BMP, SVG, AVIF, ICO

> [!NOTE]
> For how images are previewed, see [[04-File-Management/04-File-Preview]]; for embedding images in notes, see [[03-Knowledge-Management/02-Embedded-Content]].

## Related Documents

- [[04-File-Management/04-File-Preview]] — Image preview
- [[03-Knowledge-Management/02-Embedded-Content]] — Embedding images
- [[07-Settings/01-General-Settings]] — Basic settings
