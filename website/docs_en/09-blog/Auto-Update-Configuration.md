---
title: Auto-Update Configuration
tags: [settings]
---

# Auto-Update Configuration

Tydora supports auto-update: users are prompted to check for and install the latest version on startup. This page explains how to configure the signing keys required for auto-update.

## How It Works

1. When the developer builds the app, the installer is signed with a private key
2. Build artifacts include a `.sig` signature file and a `latest.json` version manifest
3. On startup, Tauri downloads `latest.json` from GitHub Releases
4. After verifying the signature, the update is downloaded and installed automatically

## The Three Update Channels

Tydora first determines the current installation form (the Rust-side `is_store_version` / `is_portable_version`) and then picks an update path:

| Channel | How it's detected | How it updates |
|---------|-------------------|----------------|
| **GitHub build** (default) | Not Store, not portable | The Tauri updater reads `latest.json` and `.sig` from GitHub Releases |
| **Microsoft Store build** | Install identity comes from MSIX | Follows Store updates; when a newer GitHub version exists, the user explicitly confirms switching to the GitHub build on the About page |
| **Portable build** | A portable marker exists | Checks and installs via the dedicated portable channel (`check_portable_update`) |

> [!TIP]
> The update entry point for both the Store and portable builds is the "About" tab in Settings; all three channels share the same signing key and `latest.json`.

## Generating a Signing Key

### Install minisign

```bash
# Windows (using scoop)
scoop install minisign

# macOS
brew install minisign

# Linux
sudo apt install minisign
```

### Generate a Key Pair

```bash
minisign -G -s ~/.tauri/tydora.key -p ~/.tauri/tydora.key.pub
```

You will be prompted for a password — that password becomes `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Two files are generated:
- `~/.tauri/tydora.key` — the private key (keep secret)
- `~/.tauri/tydora.key.pub` — the public key (public)

## Configuring GitHub Secrets

### Steps

1. Open the `zuorn/Tydora` repository
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

| Secret name | Value | Notes |
|------------|-------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | The private key file contents | The output of `cat ~/.tauri/tydora.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password set when generating the key | Optional; leave empty if no password was set |

### Copying the Private Key Contents

```bash
# Windows
type %USERPROFILE%\.tauri\tydora.key

# macOS / Linux
cat ~/.tauri/tydora.key
```

Paste the complete output into the GitHub Secret.

## Configuring the Public Key

Set the public key in `plugins.updater` of `app/tydora-desktop/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<public key contents>",
      "endpoints": [
        "https://github.com/zuorn/Tydora/releases/latest/download/latest.json"
      ]
    }
  }
}
```

> [!NOTE]
> In the September 2026 refactor the desktop crate moved from the repository-root `src-tauri/` to `app/tydora-desktop/`. Syncing `VERSION` with `tauri.conf.json` is handled by `npm run sync-version` (`scripts/sync-version.mjs`).

You can obtain the public key contents with:

```bash
# Windows
type %USERPROFILE%\.tauri\tydora.key.pub

# macOS / Linux
cat ~/.tauri/tydora.key.pub
```

## Build Artifacts

Once configured, the Release workflow (`.github/workflows/release.yml`) produces and stages the following artifacts:

| File | Platform | Notes |
|------|----------|-------|
| `Tydora_x.x.x_x64-setup.exe` | Windows | NSIS installer |
| `Tydora_x.x.x_x64-setup.exe.sig` | Windows | NSIS signature |
| `Tydora_x.x.x_x64_portable.zip` | Windows | Portable build (no install, unzip and run; CI compresses `Tydora.exe` separately) |
| `Tydora_x.x.x_x64_en-US.msi` | Windows | MSI installer (for enterprise distribution) |
| `Tydora_x.x.x_aarch64.dmg` | macOS | Apple silicon installer |
| `Tydora_aarch64.app.tar.gz` / `.sig` | macOS | Apple silicon update bundle and signature |
| `Tydora_x64.dmg` | macOS | Intel installer |
| `Tydora_x64.app.tar.gz` / `.sig` | macOS | Intel update bundle and signature |
| `Tydora_amd64.AppImage` / `.sig` | Linux | AppImage and signature |
| `Tydora_amd64.deb` / `.sig` | Linux | Debian / Ubuntu package and signature |
| `Tydora_x86_64.rpm` / `.sig` | Linux | Fedora / RHEL package and signature |
| `Tydora_x.x.x.0_x64.msix` | Windows | Microsoft Store package (produced separately by `.github/workflows/msstore.yml` — see [[09-blog/Publish-to-Microsoft-Store]]) |
| `latest.json` | All | Version manifest (read automatically by the Tauri updater) |

## Verifying the Configuration

### Local Verification

```bash
# Build the app
npm run tauri build

# Check that .sig files were generated (target lives at the repo root, set by app/.cargo/config.toml)
ls target/release/bundle/nsis/*.sig
```

### GitHub Actions Verification

1. Push to the `release` branch, or trigger the workflow manually
2. Check the build log and confirm there are no signing-related errors
3. Check that the Release includes the `.sig` files and `latest.json`

## FAQ

### Q: The build fails with a signing error

Make sure `TAURI_SIGNING_PRIVATE_KEY` contains the complete private key, including the part that starts with `untrusted comment:`.

### Q: Users can't auto-update

Check that `latest.json` is reachable:
```
https://github.com/zuorn/Tydora/releases/latest/download/latest.json
```

### Q: How do I rotate the key

1. Generate a new key pair with `minisign -G`
2. Update the private key in GitHub Secrets
3. Update the public key in `app/tydora-desktop/tauri.conf.json`
4. Rebuild and release

## Related Documents

- [[01-Getting-Started/02-About]] — Version information
- [[07-Settings/01-General-Settings]] — App settings
