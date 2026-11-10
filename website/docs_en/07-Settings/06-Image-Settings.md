---
title: Image Settings
tags: [settings]
---

# Image Settings

Image settings determine the **storage location and naming rules** for images you paste or drag in, letting you choose freely between "managed with the vault" and "stored centrally."

> [!NOTE]
> Press `Ctrl+,` to open Settings and switch to the "Image" tab.

## Per-document isolation

Whatever storage location you pick, each image goes into a subdirectory **named after the document** inside `assets/`, so images from different documents never mix:

```
vault-root/assets/My Note/screenshot-20240101120000.png
```

- Renaming a document renames its image subdirectory and updates the references inside it
- A new, not-yet-saved document collects images in `assets/untitled/`; the first save renames that directory to the document name
- Deleting a document does not remove its image subdirectory; clean it up manually if needed

## Storage Location

### Vault assets directory (default)

Images are saved under **`assets/<document name>/` at the vault root**.

- Pros: images travel with the vault when you manage, move, or back it up, so links rarely break
- Cons: the vault grows as images accumulate

Related option:

| Option | Description |
| --- | --- |
| Auto-create the assets directory | Create the directory if it doesn't exist (on by default) |

### Same folder as the document

`assets/` is created **next to the document**, i.e. `document folder/assets/<document name>/`.

- Pros: images sit right beside their document, so copying one folder carries all its assets — handy for topic-based libraries
- Cons: directories holding many documents accumulate many subdirectories

An unsaved document has no "same folder" yet, so this mode falls back to the vault `assets/`; with neither a saved document nor an open vault, a directory picker asks where to store the image.

### Fixed local directory

Images are saved to a **fixed local directory**, decoupled from any particular vault, still isolated per document underneath it (`fixed directory/<document name>/`).

- Pros: multiple vaults can share one image library
- Cons: the path depends on your local environment and may break after switching machines or moving directories

After choosing this mode, specify the directory under "Storage path" (you can pick it with the "Choose directory…" button).

### Image host upload (planned)

Image host mode is **not implemented yet**; Settings shows "Image host upload (planned)" with an explanatory note. For now, use one of the local storage modes above.

## Reference Path Format

Two forms of image reference can be written into the document; the default is **relative path**:

| Format | Example | Description |
| --- | --- | --- |
| Relative path (default) | `./assets/My Note/screenshot.png` | Resolved from the document's own folder; documents in subdirectories get `../assets/…` |
| Absolute path | `D:/notes/vault/assets/My Note/screenshot.png` | Forward-slash file system path — explicit, but breaks when the vault moves |

When a document is unsaved, or the image sits on a different drive than the document, a relative path cannot express it and the reference falls back to an absolute path.

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
