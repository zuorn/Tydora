[![GitHub Stars](https://img.shields.io/github/stars/zuorn/Tydora?style=flat-square)](https://github.com/zuorn/Tydora)
[![Release](https://img.shields.io/github/v/release/zuorn/Tydora?style=flat-square)](https://github.com/zuorn/Tydora/releases)
[![License](<https://img.shields.io/badge/license-Apache%202.0-blue?style=flat-square>)](LICENSE)
[![Platform](<https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey?style=flat-square>)]()
[![Tauri](https://img.shields.io/badge/Tauri-v2-blue?style=flat-square)](https://v2.tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square)](https://react.dev/)
[![dsh.so security](https://www.dsh.so/badge/tydora.svg)](https://www.dsh.so/artifact/tydora)
[![dsh.so install](https://www.dsh.so/badge/install/tydora.svg)](https://www.dsh.so/artifact/tydora)

![image.png](/website/assets/image-20260910-223717.png)

---

I spent a long time settling into focused writing in **Typora**, organizing my thoughts before the graphs of **Obsidian**. Yet somewhere deep down, I always felt something was missing —
a touch of <mark>absolute smoothness</mark> when your fingertips meet your thoughts, and the <mark>freedom</mark> to let knowledge unfold directly onto a canvas.

So I decided to build one myself. Its name is **Tydora**.

It's a **Markdown editor** I crafted alone through countless quiet nights — confident enough to stand in for **Typora**, ambitious enough to challenge **Obsidian**. It's more than a tool; it's a <mark>desk for fellow travelers</mark> — **clean and quiet, yet holding a world within**.

---

## **✒️ Writing Should Flow Like Breathing**

The <mark>ultimate writing experience</mark>: WYSIWYG, with an interface so <mark>clean</mark> that only the words remain. Not a single unnecessary **distraction**; wherever the cursor lands, your **thoughts** land directly on the screen. I poured every ounce of my obsession with "<mark>the feel of writing</mark>" into it, letting the tool fully **recede** — leaving only you and the <mark>river of thought</mark>.

![image.png](website/assets/image-20260815-171029.png)

---

## **🪐 Knowledge Is Not an Island — It's a Constellation**

**Relationship graphs** form between notes — the <mark>gravitational lines of thought</mark>. And the **infinite whiteboard canvas** lets you personally guide these <mark>stars</mark>, <mark>connecting them freely</mark>, <mark>restructuring logic</mark>. Going beyond the graph — here, <mark>your cognition knows no bounds</mark>.

![image.png](website/assets/image-20260815-171200.png)

---

## **🌳 From Line to Tree, See the Forest in One Step**

Turn any document into a **mind map** with one click. Linear text instantly unfolds into a **structure** of clear branches — hierarchy and connections at a glance. Outlining, dissecting books, reviewing ideas — no need to switch tools, the <mark>flow</mark> never breaks. What you see is <mark>the very shape of thought</mark>.

![image.png](website/assets/image-20260815-171446.png)

---

## **🌸 Let Your Knowledge Garden Bloom Quietly on the Web**

**Publish your local knowledge repository as a static website with one click.** Blogs, documentation, personal wikis. Sharing knowledge has finally become <mark>clean and dignified</mark>.

![image.png](website/assets/image-20260815-172124.png)

---

## **📚 A Desk Awaiting Fellow Travelers**

It is the answer I offer — and an invitation to fellow travelers.
If you're also looking for a <mark>writing companion</mark> that understands you better, come and sit with **Tydora**.

🔗 [Tydora — Let Your Ideas Flow](https://zuorn.github.io/Tydora/)

If there's anything you'd like it to do, tell me — I'll keep refining it, until it becomes the <mark>ideal version in our hearts</mark>.

## Quick Start

1. Download and install Tydora from the [Release](https://github.com/zuorn/Tydora/releases) page.

## **Run from Source**

```bash
git clone https://github.com/zuorn/Tydora.git
cd Tydora
npm install

npm run tauri dev
npm run tauri build
```

## Tech Stack


| Layer         | Technology                                                  |
| --------------- | ------------------------------------------------------------- |
| Frontend      | React 19 + TypeScript + Vite 6                              |
| Editor        | TipTap 3.x (WYSIWYG) + CodeMirror 6 (Source)                |
| Backend       | Rust (Tauri v2)                                             |
| Visualization | D3.js (Graph) + markmap (Mind Map) + React Flow (Canvas)    |
| Plugins       | tauri-plugin-fs / dialog / window-state / updater / process |

## Contributing

Issues and pull requests are welcome!

## Contributors

[![](https://contrib.rocks/image?repo=zuorn/Tydora)](https://github.com/zuorn/Tydora/graphs/contributors)

## Star History

[![Star History Chart](https://api.star-history.com/chart?repos=zuorn/Tydora&type=date&legend=top-left&sealed_token=UbjlpYMAKlj9YxE9TrI3oZEpbMArNY0oRBtXdZ4GlQe9lQG0bgKmhoGnECO6aR-BCg34sIpFHJLyux4trfCJQVTOG2DIOa2HKERx9cCUMNhsoboxUFNz8g)](https://www.star-history.com/?repos=zuorn%2FTydora&type=date&legend=top-left)

## License

This project is licensed under the [Apache License 2.0](LICENSE).
