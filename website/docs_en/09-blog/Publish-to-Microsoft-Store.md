---
title: Publishing to the Microsoft Store
tags: [publish, MSIX, Microsoft Store]
---

# What It's Like to Publish Your Own Software to the Microsoft Store

This article documents the complete process of publishing Tydora (a desktop Markdown editor built on Tauri v2) to the Microsoft Store, including the full pipeline of MSIX packaging, Partner Center configuration, and GitHub Actions auto-publishing, along with every pitfall encountered along the way.

> Applies to: Tauri v2 desktop apps, and individual/small-team developers who want to publish to the Microsoft Store.  
> Last updated: August 8, 2026.

## Background: Why MSIX

Tydora's default distribution method is NSIS (`.exe`) + MSI (`.msi`) + macOS/Linux packages, released via GitHub Releases. However, the Microsoft Store **only accepts the MSIX format**, and the `--bundles` option of Tauri CLI 2.11.2 does not support the `msix` target on Windows (only `msi`/`nsis`).

So our approach is:

1. Use `tauri build --no-bundle` to produce the **raw release exe** (the frontend is already embedded in the binary)
2. Write our own `AppxManifest.xml`
3. Use the Windows SDK's `MakeAppx.exe` to package the `exe` + manifest + icons into a `.msix`
4. Upload to Partner Center, where Microsoft signs it centrally before publishing

The whole process does not depend on Tauri's `MSIX bundler`, giving us control and precise alignment with the store identity.

## Full Workflow Overview

```
┌──────────────────────────────────┐
│ 1. Register account in Partner   │
│    Center + reserve product name │
│    + obtain store identity       │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 2. Configure MSSTORE_* in .env   │
│    Name / Publisher / DisplayName│
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 3. npm run tauri build:msix      │
│    Generate unsigned MSIX        │
│    (store mode)                  │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 4. Upload to Partner Center      │
│    Fill privacy policy / support │
│    info / channels               │
│    First version must be manual  │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 5. Wait for Microsoft review     │
│    (1-3 business days)           │
│    Approved → published          │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 6. Configure GitHub Actions      │
│    Secrets                       │
│    Subsequent versions auto-     │
│    publish via CI                │
└──────────────────────────────────┘
```

## Step 1: Registering in Partner Center and Reserving the Product Name

### 1.1 Register a Developer Account

Open [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com/), sign in with a Microsoft account, and choose "Individual developer" (individual accounts are approved in minutes and are free; company accounts require a DUNS number or business license and take 2-5 business days).

### 1.2 Create a Product and Reserve the Name

Go to [Partner Center](https://partner.microsoft.com/) → **Apps and games** → **New product**.

> [!WARNING]The product type MUST be "MSIX or PWA app". If you select "EXE or MSI app", uploading MSIX will be rejected outright, and the product type cannot be changed after creation — you can only delete it and recreate it.

Enter the product name "**Tydora**" and reserve it (after reserving, you must publish within 3 months or the reservation expires).

### 1.3 Obtain the Store Identity

After the reservation succeeds, enter the app page → **Product identity** tab at the top:

| Field | Example value | Purpose |
| --- | --- | --- |
| Package/Identity/Name | `<your Name>` (e.g., `1234567890.Tydora`) | The `Identity Name` of the MSIX manifest |
| Package/Identity/Publisher | `<your Publisher>` (e.g., `CN=XXXX-XXXX-...`) | The `Identity Publisher` of the MSIX manifest |
| PublisherDisplayName | `<your publisher display name>` | The `Properties/PublisherDisplayName` of the MSIX manifest |
| Store product ID | `<your ProductID>` (e.g., `9WZDNCRFXXXX`) | Used for subsequent CI auto-publishing |

**These three values (Name / Publisher / PublisherDisplayName) must match the values in your MSIX manifest exactly, character for character**; otherwise, Partner Center validation will reject the package. Below, we explain how to inject these three values into the manifest.

## Step 2: MSIX Manifest and Packaging Script

### 2.1 AppxManifest.xml Template

Tauri does not generate an `MSIX` manifest, so we write our own and place it at `app/tydora-desktop/msix/AppxManifest.xml`. Key points:

```xml
<Identity Name="{{PACKAGE_IDENTITY_NAME}}"
          Publisher="{{PUBLISHER}}"
          Version="{{VERSION}}"
          ProcessorArchitecture="x64" />

<Properties>
  <DisplayName>Tydora</DisplayName>
  <PublisherDisplayName>{{PUBLISHER_DISPLAY_NAME}}</PublisherDisplayName>
  <Logo>Assets\StoreLogo.png</Logo>
  <Description>A modern Markdown editor built with Tauri</Description>
</Properties>
```

The three `{{...}}` placeholders are replaced with actual values by the packaging script at runtime.

> [!WARNING]The order of child elements under `<Properties>` is strictly constrained by the XML Schema: it must be DisplayName → PublisherDisplayName → Logo → Description. If Description is written before Logo, MakeAppx will report C00CEE3B (app manifest XML must be valid), but the error message appears as garbled characters (`????????????????`), making it hard to locate.
> This is the first major pitfall covered in this article — the error was reported at Line 28, Column 15, but the real problem was the element order on line 25.

### 2.2 File Associations (Optional)

If you want the app to take over `.md` files, add `<Extensions>` under the `<Applications>` node:

```xml
<Extensions>
  <uap:Extension Category="windows.fileTypeAssociation">
    <uap:FileTypeAssociation Name="markdown">
      <uap:SupportedFileTypes>
        <uap:FileType>.md</uap:FileType>
        <uap:FileType>.markdown</uap:FileType>
        <uap:FileType>.mdx</uap:FileType>
      </uap:SupportedFileTypes>
    </uap:FileTypeAssociation>
  </uap:Extension>
</Extensions>
```

### 2.3 Capabilities

```xml
<Capabilities>
  <rescap:Capability Name="runFullTrust" />  <!-- Required for desktop apps -->
  <Capability Name="internetClient" />        <!-- Auto-update check -->
</Capabilities>
```

`runFullTrust` is a **restricted capability**; when you submit, Partner Center will require you to explain its purpose (see Section 4.3).

### 2.4 Packaging Script build-msix.ps1

Core workflow:

1. **Determine the mode**: check whether `MSSTORE_PACKAGE_IDENTITY_NAME` and `MSSTORE_PUBLISHER` are both present
   - Both present → **Store mode** (unsigned, artifact for Partner Center)
   - Either missing → **Local test mode** (self-signed, installable locally)
2. **Read the release exe**: `target/release/Tydora.exe` (the repo-root `target/` directory, set by `target-dir` in `app/.cargo/config.toml`; falls back to probing `tydora-desktop.exe`)
3. **Staging directory**: `target/msix-staging/`, put the exe + icons + generated manifest inside
4. **MakeAppx pack**: package into `target/msix/Tydora_<version>_x64.msix`
5. **Sign** (local mode only, or explicitly `-Sign`): create a self-signed certificate and sign using `Sign-AppxPackage`

**Version number source**: read from the repository-root `VERSION` file, converted to the four-part form `0.1.4.0` (MSIX requires `Major.Minor.Build.Revision` with four segments; empty slots are padded with 0).

### 2.5 Hook into the npm Script

`scripts/run-tauri.mjs` intercepts the `build:msix` subcommand and forwards it to the PowerShell script:

```javascript
if (subCommand === 'build:msix') {
    const args = process.argv.slice(3).join(' ');
    spawnSync('pwsh', ['-File', 'scripts/build-msix.ps1', ...args], { stdio: 'inherit' });
}
```

Register it in `package.json`:

```json
"scripts": {
    "tauri": "node scripts/run-tauri.mjs"
}
```

This lets you package with `npm run tauri build:msix`.

## Step 3: Local Packaging

### 3.1 Configure .env

Fill in the store identity in the `.env` file at the project root:

```dotenv
# Existing Tauri signing key (for NSIS/MSI auto-update signing, not MSIX signing)
TAURI_SIGNING_PRIVATE_KEY=...
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=...

# Microsoft Store identity (for MSIX packaging)
MSSTORE_PACKAGE_IDENTITY_NAME=<your Name>
MSSTORE_PUBLISHER=<your Publisher>
MSSTORE_PUBLISHER_DISPLAY_NAME=<your publisher display name>
```

> [!WARNING]Do not add quotes to values in `.env`. Tydora's loadEnv parser only splits on the first `=` and trims both sides; it does not strip quotes. If you write `MSSTORE_PACKAGE_IDENTITY_NAME="your Name"`, the quotes are passed to MakeAppx as part of the value, causing Partner Center to fail validation of the Identity Name.
> This is the second pitfall covered in this article — "invalid package identity name: Tydora (expected: your Name)" actually happened because `.env` was previously written as `= " your Name"` (with a leading space and quotes).

### 3.2 Run the Packaging

```powershell
# Full packaging (includes Rust compilation; first time takes about 5-10 minutes)
npm run tauri build:msix

# Skip compilation and only re-package (when a release exe already exists; near-instant)
npm run tauri build:msix -- -SkipBuild

# Skip signing (store mode is unsigned by default; this flag merely suppresses the signing warning)
npm run tauri build:msix -- -SkipBuild -NoSign
```

### 3.3 Verify the Artifact

After a successful package, the console outputs:

```
Identity Name:        <your Name>
Publisher:            <your Publisher>
PublisherDisplayName: <your publisher display name>
Mode:                 Store (unsigned)
Package creation succeeded.

✓ MSIX generated: D:\code\Tydora\target\msix\Tydora_0.1.4.0_x64.msix
  Size: 6.09 MB
```

> [!IMPORTANT]Double-clicking this unsigned MSIX locally shows "Publisher: Unknown" and errors with 0x800B010A (certificate not trusted). This is expected — store-mode packages are not meant to be installed locally; they should only be uploaded to Partner Center, where Microsoft signs them centrally with its own certificate before distributing them to end users.
> If you want to test the installation locally, use local mode (comment out the three `MSSTORE_*` lines in `.env`) to build a self-signed package; it installs without errors locally.

## Step 4: Uploading to Partner Center

### 4.1 Start a New Submission

Enter the Tydora app page → **Start a submission**. The blocks that need to be filled in:

| Block | Contents |
| --- | --- |
| Packages | Upload the `.msix` file |
| Pricing and availability | Free / paid regions |
| Properties | App category, privacy policy URL, etc. |
| Age ratings | Age-rating questionnaire |
| Store listing | Store page copy, screenshots, icons |

### 4.2 Upload Packages

In the **Packages** block, drag the locally generated `Tydora_0.1.4.0_x64.msix` in.

After the upload completes, Partner Center automatically parses the Identity information and validates it:

```
Package identifier:  <your Name>_0.1.4.0_x64__<PFN suffix>
Version:             0.1.4.0
Architecture:        x64
```

If it matches the Name/Publisher you registered in Partner Center, a green ✓ is shown; otherwise it reports something like:

```
Invalid package identity name: Tydora (expected: <your Name>)
Invalid package publisher name: CN=Tydora (expected: <your Publisher>)
```

In that case you need to:

1. Check whether `MSSTORE_PACKAGE_IDENTITY_NAME` / `MSSTORE_PUBLISHER` in `.env` are correct
2. Re-package with `-SkipBuild` (near-instant)
3. In the Packages page, **delete the old package first**, then upload the new one

### 4.3 Fill in the Restricted Capability Description (runFullTrust)

Because the MSIX manifest declares `rescap:Capability Name="runFullTrust"`, Partner Center will require you to explain its purpose in "Properties" or "Notes for certification".

**What I filled in**:

> Tydora is a desktop Markdown editor built with the Tauri v2 framework, whose core working mode is "local-first" — all notes, files, and configuration are stored on the user's own device and never pass through any cloud server.
>
> `runFullTrust` is a standard requirement for Tauri desktop apps and is specifically used for:
>
> 1. **File system read/write**: users choose a local folder as the note storage location through the "Vault" mechanism; the app needs to directly read and write `.md` files, image attachments, etc. in that folder.
> 2. **File system watching**: when users edit notes simultaneously with other editors, the app needs to watch local file changes (via the Rust `notify` crate) to keep the link index in sync in real time.
> 3. **System file dialogs**: uses Tauri's `plugin-dialog` to provide native open/save dialogs.
> 4. **Launching external programs**: opening files with the system default app, locating files in the file manager, etc.
> 5. **Publish website feature**: invokes a local Node.js CLI to build Markdown into a static website.
>
> The app **does not collect any personal user data**; all operations are performed locally. It contains no third-party analytics SDKs or advertising SDKs. `runFullTrust` is used solely for the desktop scenarios above and does not bypass system security mechanisms.

### 4.4 Privacy Policy URL

The Microsoft Store **mandates** that all apps provide a privacy policy URL. I added a dedicated page to the docs site: [Privacy Policy · Tydora](https://zuorn.github.io/Tydora/01-%E5%BC%80%E5%A7%8B%E4%BD%BF%E7%94%A8/%E9%9A%90%E7%A7%81%E7%AD%96%E7%95%A5)

Key points of the privacy policy content (per the Microsoft Store review checklist):

- ✅ An explicit local-first statement that "no personal data is collected"
- ✅ Which "local-only" non-personal data is written to localStorage
- ✅ An explanation of the auto-update mechanism (HTTPS-only version checking, no user data)
- ✅ An explanation of Microsoft-side telemetry for the MSIX Microsoft Store version
- ✅ No third-party analytics/advertising SDKs
- ✅ Data security, retention, and deletion methods
- ✅ Children's privacy, user rights, and policy updates

### 4.5 Store Page Assets

The **Store listing** block requires:

- At least 1 screenshot (1920×1080, PNG recommended)
- App icon (512×512)
- Short description (≤ 200 characters)
- Detailed description (≤ 10000 characters)
- Release notes (optional)

### 4.6 Submit for Review

After filling in all the blocks, click **Submit for certification**. Status changes:

```
Pending → Pre-processing → Certification → Publishing → In the Store
```

The whole certification process usually takes **1-3 business days**. If it is rejected, Partner Center tells you the specific reason (e.g., the privacy policy URL is inaccessible, the `runFullTrust` explanation is insufficient, etc.); fix it and resubmit.

## Step 5: CI Auto-Publishing After the First Version Passes Review

Microsoft's hard requirement: **the first version must be uploaded manually**; subsequent versions can then be auto-published via the API.

### 5.1 Link a Microsoft Entra ID

In Partner Center:

1. Gear icon at the top-right → **Account settings** → **Organizations** (or Entra ID / Azure AD)
2. Link your Microsoft Entra ID tenant (individual developers can use the default tenant corresponding to their own Microsoft account)
3. **Register an app** in Entra ID: Azure Portal → App registrations → New registration
4. Grant this app the **Manager** role in Partner Center

### 5.2 Obtain the 4 Secret Values

| Secret name | Where to get it |
| --- | --- |
| `AZURE_AD_TENANT_ID` | Entra ID → App registrations → Overview → **Directory (tenant) ID** |
| `AZURE_AD_APPLICATION_CLIENT_ID` | Same as above → **Application (client) ID** |
| `AZURE_AD_APPLICATION_SECRET` | Same as above → Certificates and secrets → New client secret → the generated value\*\* (shown only once!) \*\* |
| `SELLER_ID` | Partner Center → Account settings → Legal Info → **Seller ID** |

### 5.3 Configure the GitHub Repository

Go to the repository **Settings → Secrets and variables → Actions**:

**🔒 Secrets (sensitive information)**:

| Name | Value |
| --- | --- |
| `AZURE_AD_TENANT_ID` | The tenant ID above |
| `AZURE_AD_APPLICATION_CLIENT_ID` | The client ID above |
| `AZURE_AD_APPLICATION_SECRET` | The client secret above |
| `SELLER_ID` | The Seller ID above |

**📋 Variables (non-sensitive, control toggles)**:

| Name | Value |
| --- | --- |
| `MSSTORE_PACKAGE_IDENTITY_NAME` | `<your Name>` (e.g., `1234567890.Tydora`) |
| `MSSTORE_PUBLISHER` | `<your Publisher>` (e.g., `CN=XXXX-XXXX-...`) |
| `MSSTORE_PUBLISHER_DISPLAY_NAME` | `<your publisher display name>` |
| `MSSTORE_PRODUCT_ID` | The Store product ID on the Partner Center overview page (e.g., `9WZDNCRFXXXX`) |

> [!IMPORTANT]Key design: the publish step in `.github/workflows/msstore.yml` is gated with `if: vars.MSSTORE_PRODUCT_ID`. As long as the `MSSTORE_PRODUCT_ID` variable is not configured, the workflow only builds the MSIX and attaches it to the GitHub Release, and does not attempt to call `msstore publish`.
> This means you can push a tag now to verify that MSIX packaging works, and enable auto-publishing only after manually publishing the first version.

### 5.4 Workflow File

The complete workflow `.github/workflows/msstore.yml`, core steps:

```yaml
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  msix:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
      - name: Install Rust stable
        uses: dtolnay/rust-toolchain@stable
      - name: Rust cache
        uses: swatinem/rust-cache@v2
      - name: Install frontend dependencies
        run: npm ci
      - name: Build MSIX
        shell: pwsh
        env:
          MSSTORE_PACKAGE_IDENTITY_NAME: ${{ vars.MSSTORE_PACKAGE_IDENTITY_NAME }}
          MSSTORE_PUBLISHER: ${{ vars.MSSTORE_PUBLISHER }}
        run: ./scripts/build-msix.ps1
      - name: Upload MSIX artifact
        uses: actions/upload-artifact@v4
        with:
          name: tydora-msix
          path: target/msix/*.msix
      - name: Attach MSIX to GitHub Release
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v2
        with:
          files: target/msix/*.msix
      # The following steps only run when MSSTORE_PRODUCT_ID is configured
      - name: Setup Microsoft Store CLI
        if: vars.MSSTORE_PRODUCT_ID
        uses: microsoft/microsoft-store-apppublisher@v1.1
      - name: Reconfigure store credentials
        if: vars.MSSTORE_PRODUCT_ID
        run: |
          msstore reconfigure `
            --tenantId ${{ secrets.AZURE_AD_TENANT_ID }} `
            --sellerId ${{ secrets.SELLER_ID }} `
            --clientId ${{ secrets.AZURE_AD_APPLICATION_CLIENT_ID }} `
            --clientSecret ${{ secrets.AZURE_AD_APPLICATION_SECRET }}
      - name: Publish package to Store
        if: vars.MSSTORE_PRODUCT_ID
        run: |
          $msix = Get-ChildItem target/msix/*.msix | Select-Object -First 1
          msstore publish $msix.FullName -id ${{ vars.MSSTORE_PRODUCT_ID }}
```

### 5.5 Triggering a Release

```bash
# Create a tag
git tag v0.1.5
git push origin v0.1.5
```

After pushing, GitHub Actions runs automatically: build → package → upload Release → (when variables are configured) publish to the store. The whole process takes about 10-15 minutes.

## Summary of Pitfalls

### Pitfall 1: MakeAppx Reports C00CEE3B with a Garbled Error Message

**Symptom**:

```
MakeAppx : error: Error info: error C00CEE3B: App manifest validation error:
The app manifest XML must be valid: Line 28, Column 15, Reason: ???????????????????????????
```

**Root cause**: The order of child elements under `<Properties>` did not conform to the `XML Schema`. The correct order must be `DisplayName → PublisherDisplayName → Logo → Description`; I had originally written `Description` before `Logo`.

**Fix**: Adjust the element order in `AppxManifest.xml`.

### Pitfall 2: Chinese Characters Become Garbled and Eat the Closing Tag

**Symptom**: MakeAppx still reports C00CEE3B, but this time it is a genuine XML parsing error.

**Root cause**: PowerShell 5.1's `Get-Content -Raw` decodes UTF-8 bytes using the system default encoding (on Chinese Windows = GBK/936) when the file has no BOM. The specific point of corruption:

- The UTF-8 encoding of the "宁" in "左瑞**宁**" is `E5 AE 81`
- The `<` immediately after it is `3C`
- GBK treats `81 3C` as a valid double-byte Chinese character → **swallowing** the `<`
- As a result, `</PublisherDisplayName>` becomes `?/PublisherDisplayName>`, and the XML closing tag breaks

**Fix**: In `build-msix.ps1`, change `Get-Content -Raw` to `[System.IO.File]::ReadAllText(path, [System.Text.Encoding]::UTF8)`, and add a UTF-8 BOM to `AppxManifest.xml`.

### Pitfall 3: Identity Name Does Not Match

**Symptom**:

```
Invalid package identity name: Tydora (expected: <your Name>)
Invalid package publisher name: CN=Tydora (expected: <your Publisher>)
```

**Root cause**: The values in `.env` had quotes and a leading space:

```dotenv
MSSTORE_PACKAGE_IDENTITY_NAME = " <your Name>"
```

Tydora's `loadEnv` parser does not strip quotes, so the Name actually passed to MakeAppx was a string with quotes and spaces, triggering the Partner Center validation failure.

**Fix**: Remove the quotes and the spaces around `=` in `.env`:

```dotenv
MSSTORE_PACKAGE_IDENTITY_NAME=<your Name>
```

### Pitfall 4: PublisherDisplayName Does Not Match

**Symptom**:

```
The PublisherDisplayName element in the app manifest is Tydora, which does not match the publisher display name: <your publisher display name>
```

**Root cause**: The publisher display name filled in at Partner Center registration (individual accounts default to the real name), but the manifest template hardcoded "Tydora".

**Fix**: Change `PublisherDisplayName` to the placeholder `{{PUBLISHER_DISPLAY_NAME}}`, injected from `.env` by the script.

### Pitfall 5: Double-Clicking the Unsigned MSIX Locally Reports 0x800B010A

**Symptom**: A store-mode package, double-clicked locally, shows "Publisher: Unknown", the install button is grayed out, and it errors with `0x800B010A`.

**Root cause**: This is not a pitfall; it is **expected behavior**. Store-mode packages are not signed and should only be uploaded to Partner Center, where Microsoft signs them centrally before distribution.

**Solution**: If you only want to test the installation locally, use local mode (comment out the three `MSSTORE_*` lines in `.env`) to build a self-signed package.

## Quick Command Reference

```powershell
# Full packaging (includes Rust compilation)
npm run tauri build:msix

# Skip compilation, only re-package
npm run tauri build:msix -- -SkipBuild

# Skip signing (store mode never signs anyway; in local mode this yields an uninstallable unsigned package)
npm run tauri build:msix -- -SkipBuild -NoSign

# Local test mode (without configuring MSSTORE_* variables; the script falls back to self-signed mode)
Remove-Item Env:MSSTORE_PACKAGE_IDENTITY_NAME, Env:MSSTORE_PUBLISHER, Env:MSSTORE_PUBLISHER_DISPLAY_NAME -ErrorAction SilentlyContinue
npm run tauri build:msix -- -SkipBuild
```

## Related Documents

- [[01-Getting-Started/Privacy-Policy]] — the privacy policy page required by the Microsoft Store
- [[08-Advanced-Features/01-Publish-Website]] — Tydora's built-in static website publishing feature
- [[09-blog/Auto-Update-Configuration]] — GitHub Releases auto-update signing configuration
- [[01-Getting-Started/02-About]] — Tydora version information and tech stack

## References

- [Publishing app updates to Microsoft Store with GitHub Actions](https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/github-actions?tabs=msix)
- [MakeAppx.exe documentation](https://learn.microsoft.com/zh-cn/windows/win32/appxpkg/make-appx-package--makeappx-exe-)
- [App package manifest schema reference](https://learn.microsoft.com/en-us/uwp/schemas/appxpackage/uapmanifestschema/schema-root)
- [Microsoft Store submission API](https://learn.microsoft.com/en-us/windows/uwp/monetize/create-and-manage-submissions)
