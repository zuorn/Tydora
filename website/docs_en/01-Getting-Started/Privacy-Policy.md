---
title: Privacy Policy
tags: [legal]
---

# Tydora Privacy Policy

This privacy policy explains how Tydora (the "App") collects, uses, and shares user information.
**Your note content always belongs to you and is stored on your own device; the App never uploads your note content, filenames, or vault structure.**

> This policy was last updated on September 10, 2026.
> If there are material changes, we will notify you via an in-app notice or the GitHub Releases notes.

## 1. What Information We Collect

**Tydora is a local-first desktop application and does not proactively upload your note content to any server.**
Specifically:

### 1.1 Information We Do Not Collect

- Your note content, filenames, and vault folder structure — **all of it stays in the local directory (vault) you specify; the App never uploads it to any remote server.**
- Accounts, passwords, and payment information — the App **has no account system at all**, and no paid or subscription features.
- Clipboard contents — paste operations are handled entirely on your device.
- Keyboard input history — all input is written directly to local files and is not recorded.
- Location, contacts, photos, camera, and microphone — the App **never requests these system permissions**.

### 1.2 Anonymous Usage Analytics (optional, requires your consent)

To understand feature usage and to locate crashes and errors, the App includes **anonymous usage analytics** (based on the open-source Umami service):

- **A dialog asks for your consent on first launch.** No data is sent unless you agree.
- Only **behavior event names** and a few non-sensitive properties are reported, such as "app launched", "settings opened", "theme changed", "PDF exported", "publish build".
- **Never collected**: file paths, filenames, document content, vault names, clipboard contents, or any personally identifiable information.
- Event names are validated against an **allowlist**; events outside the allowlist are never sent, preventing accidental reporting of sensitive strings.
- Data is sent via `https://gateway.umami.is` and does not write cookies. No other analytics SDK — Google Analytics, App Center, Umeng, or otherwise — is used.
- You can **turn the toggle off at any time** in "Settings → General → Behavior"; once off, no data is sent. You may also decline directly in the consent dialog.

### 1.3 Local, Non-Personal Data

The following data is **written only to storage on your local device** and is never sent to any server:

| Data type | Storage location | Purpose |
| --- | --- | --- |
| Editor preferences (theme, font, font size, line height, etc.) | `localStorage` (browser/WebView local storage) | Remember your UI and editor settings |
| Window state (position, size, maximized or not) | A local JSON file managed by the Tauri `window-state` plugin | Restore the window layout on next launch |
| Recent vault list and currently active vault | `localStorage` | Reopen the last vault on startup |
| Sidebar widths, tab placement, panel collapse state | `localStorage` | Remember your preferred UI layout |
| Link index, tag index | `localStorage` | Speed up link resolution, tag filtering, and graph rendering |
| Bookmarks, custom shortcuts, Vim configuration | `localStorage` | Remember your personalization |
| Copies created by pasting images | The `assets/` directory inside the vault (configurable to a fixed directory in Settings) | Support pasting images from the clipboard directly into a note |

### 1.4 Auto-Update

- On startup, the updater makes a single HTTPS request to **GitHub Releases** to check whether an update exists.
- That request **sends only the app version and the current operating system**, and contains no personal data. GitHub may log ordinary web access records (IP, user agent) — that is generic GitHub behavior and is unrelated to Tydora.
- The Microsoft Store build instead follows Store updates; when a newer GitHub version is detected, the channel switch happens only after you explicitly confirm it.

### 1.5 Microsoft Store Distribution (MSIX)

- If you install the App from the **Microsoft Store**, Microsoft collects standard Store telemetry (installs, uninstalls, crash reports, etc.) under its own privacy policy. **That data is handled by Microsoft and is not directly accessible to us.**
- The App itself does not integrate the Microsoft Store Analytics SDK and does not send Microsoft any additional telemetry.
- See Microsoft's privacy statement: [https://privacy.microsoft.com/en-us/privacystatement](https://privacy.microsoft.com/en-us/privacystatement)

## 2. How We Use Information

Apart from the optional anonymous analytics described above, the App **collects no personal information**, so there is no "use" of personal information to speak of. All editing, indexing, graphing, and exporting happens on your local device.

Anonymous analytics is used only to understand which features are used, to gauge version distribution, and to spot abnormal-exit trends — so we can prioritize development.

## 3. Sharing, Disclosure, and Third-Party Transfers

- **We do not share your note content with any third party**, because we never hold that data.
- Anonymous analytics events are sent to the Umami service, limited to allowlisted event names and a few non-sensitive properties, as described in 1.2.
- The App contains no advertising SDK and displays no ads.

## 4. Data Security

- All notes and vault files are stored in the local folder you choose; their security is provided by your own file system and operating system.
- You are free to use cloud sync (OneDrive, iCloud, Nutstore, etc.) or version control (such as Git) to protect your files. **Tydora neither interferes with nor intercepts such synchronization.**
- Because we store none of your content on a server, there is no "cloud database breach" risk.

## 5. Data Retention and Deletion

- All local data produced by the App (`localStorage`, window-state JSON, `assets/` images, note files, etc.) **remains for as long as you do not delete it**.
- How to delete:
  - Notes and images: delete the corresponding files in your file manager, or right-click and delete inside the app's file tree (note: in-app deletion is irreversible).
  - App preferences: uninstall the app, or manually delete the configuration files under `%APPDATA%/com.tydora.editor/` (Windows).
  - The vault itself: delete the corresponding folder on your disk.
- After you turn off the anonymous analytics toggle, the App sends no further data to the analytics service.

## 6. Children's Privacy

- The App targets general users, **has no features designed for children under 13**, and does not proactively collect any age information.
- Because the App collects no personal information, there is no risk of children's personal information being mishandled.

## 7. Exceptions to Scope

- **Publish to website**: if you use the built-in "Publish Website" feature, the generated static HTML is saved to a local directory you specify; you may then upload those files to any hosting service you control. **Tydora itself never uploads any file on your behalf.**
- **Built-in terminal**: terminal sessions use your machine's shell, and their behavior (including network access) is identical to operating in your system terminal directly. This policy does not govern them.
- **External links**: links to external websites inside the app (documentation, open-source license pages, GitHub links, etc.) are governed by those sites' own privacy policies once clicked.

## 8. Your Rights

Because we hold none of your personal information, you do not need to exercise any "access / correct / delete / export" rights with us — all that data is on your own disk and you can act on it directly. For anonymous analytics, you can turn the toggle off in Settings at any time.

If you still have questions or complaints about this privacy policy, please contact us via GitHub Issues or email.

## 9. Policy Updates

If significant changes to the app require this policy to be adjusted, we will:

1. Publish an updated version on this page (the documentation site's Privacy Policy page) with a new "last updated" date;
2. Mention a summary of the changes in the in-app "Settings → About" changelog or the GitHub Releases notes.
