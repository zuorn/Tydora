# Tydora PDF 导出方案改造设计（MarkFlowy 方案移植）

> 状态：**待确认**（用户要求"先确定方案"，本文只做设计，不含代码改动）
> 日期：2026-08-30
> 参考实现：`/Users/admin/WorkBuddy AI/2026-09-04-22-15-38/MarkFlowy/apps/desktop/src/components/EditorArea/pdf-print/`
> 改造目标：`/Users/admin/WorkBuddy/Tydora`

---

## 一、结论先行

把 Tydora 的 PDF 导出从 **「html2canvas 4x 栅格化 + jsPDF A4 位图切片拼接」**
替换为 **MarkFlowy 的「隐藏 Tauri 打印窗口 + 系统原生 `window.print()`」**，产出**矢量 PDF**。

核心收益：

| 维度 | 现状（html2canvas + jsPDF） | 改造后（系统打印） |
| --- | --- | --- |
| PDF 性质 | **位图**（文字不可选、不可搜索、不能复制） | **矢量**（文字可选、可搜索、可复制） |
| 文件体积 | 大（4x JPEG 0.98 逐页嵌入，数十 MB 常见） | 小（通常 1/20 ~ 1/50） |
| 清晰度 | 依赖 `RENDER_SCALE = 4`，放大有锯齿 | 任意缩放无损（打印级 300dpi+） |
| 分页 | 手写 `findSafePageBreaks` + 行边界 snap（约 400 行启发式代码） | 浏览器原生分页 + CSS `break-inside/after` |
| 表格/代码块跨页 | 靠 `UNSPLITTABLE_SELECTORS` 猜测避让，仍有裁断 | 原生 `break-inside: avoid`，`thead` 自动跨页重复 |
| 主题适配 | 需 `getExportBackgroundColor` + 白底兜底 | `@media print` 原生控制 |
| 依赖 | `html2canvas ^1.4.1` + `jspdf ^4.2.1` | 零新增依赖（只用已有 `@tauri-apps/api`） |

---

## 二、MarkFlowy 方案原理

```
主窗口                                       打印窗口（隐藏）
─────────                                    ────────────────
用户点"导出 PDF"
   │
   ├─ 离屏渲染文档 → 取 innerHTML
   ├─ makePrintDocumentTransferable()         new WebviewWindow(label,
   │    blob: 图片 → data URL（跨窗口失效）        { visible: false })
   │
   ├─ new WebviewWindow(...)  ───────────────►  挂载完成
   │                                              │
   │  ◄─── emitTo(main, READY) ───────────────────┤
   │                                              │
   ├─ emitTo(printWin, DATA, payload) ───────►  dangerouslySetInnerHTML
   │                                              │
   │                                          preparePrintDocument()
   │                                            ├ waitForPrintLayout（图片/字体/布局）
   │                                            └ replaceInteractiveMedia
   │                                              │（iframe/video/canvas → 占位块）
   │                                          window.print()  ← 系统打印对话框
   │                                              │
   │                                          createPrintDialogCompletionObserver()
   │                                            ├ afterprint 事件
   │                                            ├ matchMedia('print') 回落
   │                                            ├ Tauri onFocusChanged（blur→focus）
   │                                            └ 30 分钟兜底超时
   │                                              │
   │  ◄─── emitTo(main, RESULT) ──────────────────┤
   │                                          currentWindow.destroy()
```

关键源码文件（MarkFlowy）：

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `printDocument.ts` | 378 | 打印前资源准备 + `invokeSystemPrint` |
| `pdfPrintWindow.ts` | 183 | 跨窗口协议（事件名/窗口创建/握手） |
| `PdfPrintController.tsx` | 212 | 主窗口侧控制器 |
| `PdfPrintWindowApp.tsx` | 160 | 打印窗口侧 React 应用 |
| `printDialogCompletion.ts` | 94 | 系统打印对话框关闭检测 |
| `pdf-print.css` | 187 | 分页控制 + `@page` 规则 |
| `pdfPrintMenuItem.ts` | 16 | 事件触发层 |

---

## 三、Tydora 现状盘点（关键事实）

### 3.1 现有 PDF 链路

```
App.tsx:3383  命令面板 "export-pdf" → handleExportRef.current("pdf")
App.tsx:3266  handleExport(format)
                 └─ buildExportArtifact(format, ctx)      [src/export/index.ts:60]
                      ├─ prepareExportElement(raw, theme)  [dom.ts:320]
                      ├─ inlineImages(raw)                 [dom.ts:143]
                      ├─ collectDocumentCSS()              [dom.ts:7]
                      └─ case "pdf":                       [index.ts:95-100]
                           ├─ replaceTaskCheckboxesWithSvg(container)
                           ├─ exportPdfBytes(container, bg)   ← 要换掉这个
                           │     [exporters.ts:709-766]
                           │     ├─ html2canvas(scale: 4)   [RENDER_SCALE=395]
                           │     ├─ findSafePageBreaks(...)  [手写分页启发式]
                           │     ├─ 逐页 drawImage + toDataURL("image/jpeg", 0.98)
                           │     └─ pdf.addImage → pdf.output("arraybuffer")
                           └─ renderToPng(container, bg)   ← 预览图，可保留
                 └─ setExportPreview({ format, artifact })
                      └─ ExportPreviewDialog               [404 行]
                           ├─ buildPdfPreviewHtml()  ← 另有 ~240 行 JS 分页脚本
                           └─ 确认 → saveExportArtifact → 系统保存对话框
```

### 3.2 改造时可复用的既有资产（不要丢）

| 资产 | 位置 | 复用方式 |
| --- | --- | --- |
| `prepareExportElement` | `dom.ts:320` | 清理编辑器专属 DOM（工具栏/缩放手柄/selection 态）+ 挂离屏容器 + 注入 Tydora header |
| `inlineImages` | `dom.ts:143` | 本地/远程图片 → data URL，产物自包含（含 TTL 缓存 + 魔数 MIME 探测） |
| `collectDocumentCSS` | `dom.ts:7` | 收集全量 CSS 规则 → 自包含（**自带主题变量**，跨窗口无需再装 themes.css） |
| `replaceTaskCheckboxesWithSvg` | `dom.ts:399` | 任务列表复选框 → SVG |
| `buildHtmlDoc` | `exporters.ts:61` | **已能产出完整独立 HTML 文档**（含 `<!DOCTYPE>`、`<style>`、`@media print`） |

> ⚠️ **`buildHtmlDoc` 是本次改造最大的杠杆**：Tydora 已经有了"完整独立 HTML 文档"，
> 比 MarkFlowy 需要分别传 `innerHTML + CSS + fontFamily` 更完整。改造后打印窗口
> 拿到的是与「导出 HTML」完全同源的产物，一致性天然保证。

### 3.3 改造必须处理的差异

| # | 差异点 | 现状 | 处理 |
| --- | --- | --- | --- |
| 1 | **缺建窗权限** | `capabilities/default.json` 无 `core:webview:allow-create-webview-window`（MarkFlowy 有） | 需新增该权限（+ 可选 `core:webview:allow-print`） |
| 2 | 主窗口 label | `tauri.conf.json` 未显式写 label，Tauri 默认为 `"main"`（`App.tsx:2491` 已验证 `getCurrentWindow().label === "main"`） | **无需改配置**，`emitTo("main", ...)` 直接可用 |
| 3 | 多窗口路由 | `main.tsx` **已有** `?window=` 分流（settings / vault-manager / mindmap / graph / canvas / editor） | 只需加 `pdf-print` 分支，**天然契合 MarkFlowy 模式** |
| 4 | 建窗方式 | Tydora 走 Rust `invoke("open_settings_window")` → `WebviewWindowBuilder`（`lib.rs:204`） | 建议**不走 Rust**，改纯前端 `new WebviewWindow()`，避免重编 Rust（Tydora Rust 依赖重，重编慢） |
| 5 | **大字符串 IPC** | `saveExportArtifact` 已因 `STATUS_HEAP_CORRUPTION` 做了 512KB 分块写文件（`index.ts:132`） | ⚠️ **最大风险**：内联图片后的 HTML 可达数 MB，直接走 `emitTo` payload 会踩同一个坑 → 改用临时文件 + `asset://` |
| 6 | `emitTo` 已有 | `capabilities/default.json` 已含 `core:event:allow-emit-to` / `allow-listen` | 无需改 |
| 7 | asset 协议 | `tauri.conf.json` `assetProtocol.enable: true` scope `**`，`Cargo.toml` 已开 `protocol-asset` feature | 可直接使用 `convertFileSrc()`（目前代码里尚未用过） |

---

## 四、改造方案（推荐：Option D）

> 候选方案对比见 §七。推荐 **Option D**：
> **沿用 `?window=pdf-print` 路由 + `dangerouslySetInnerHTML` 注入 + 临时 HTML 文件传大内容**。

### 4.1 数据流

```
主窗口 (label: "main")                        打印窗口 (label: "tydora-pdf-print-<jobId>")
──────────────────────                        ────────────────────────────────────────────
点"导出 PDF"（命令面板 / 菜单 / 底部栏）
   │
   ├─ buildExportArtifact("pdf", ctx)  [改造 case "pdf"]
   │    ├─ prepareExportElement(raw, theme)
   │    ├─ inlineImages(raw)
   │    ├─ replaceTaskCheckboxesWithSvg(container)
   │    ├─ html = buildHtmlDoc(raw, css, theme, title,
   │    │                      { printOptimized: true })
   │    └─ return { content: "", previewHtml: html,
   │                printJob: { html, title, theme, jobId } }
   │
   ├─ [新] 写临时文件
   │    $TMPDIR/tydora-pdf-print/<jobId>.html
   │    （走 fs:allow-write-text-file，已授权 **）
   │
   ├─ [新] new WebviewWindow(label, {
   │      url: "index.html?window=pdf-print&job=<jobId>",
   │      visible: false, focus: false,
   │      title, width: 900, height: 1000
   │    })  ───────────────────────────────►  main.tsx Root 命中 pdf-print
   │                                            └─ <Suspense><PdfPrintWindow/></Suspense>
   │                                                  │
   │  ◄─── emitTo("main", PDF_PRINT_READY) ───────────┤ 挂载完成
   │                                                  │
   ├─ emitTo(label, PDF_PRINT_DATA, ──────────────►  { assetUrl, title, theme, jobId }
   │         { assetUrl, ... })                       │
   │    （payload 只有一个 URL，几 KB）               ├─ fetch(assetUrl) → html 文本
   │                                                  ├─ DOMParser 拆出 <style> 与 <body>
   │                                                  ├─ <style> 注入 head
   │                                                  ├─ root.data-theme = theme
   │                                                  └─ dangerouslySetInnerHTML(bodyHtml)
   │                                                        │
   │                                                  preparePrintDocument()
   │                                                    ├ 等 document.fonts.ready
   │                                                    ├ 等所有 img.complete（15s 超时）
   │                                                    ├ 等 mermaid / katex 布局稳定
   │                                                    └ replaceInteractiveMedia()
   │                                                        │
   │                                                  show() + setFocus()
   │                                                  window.print()   ← 系统打印对话框
   │                                                        │          （用户"另存为 PDF"）
   │                                                  createPrintDialogCompletionObserver()
   │                                                        │
   │  ◄─── emitTo("main", PDF_PRINT_RESULT) ────────────────┤
   │                                                  getCurrentWindow().destroy()
   │
   ├─ 删除临时 HTML 文件
   └─ 结束（不弹 ExportPreviewDialog，或改为"已发送到打印"提示）
```

### 4.2 为什么用「临时文件 + `asset://`」而不是直接传 HTML 字符串

- Tydora 的 `saveExportArtifact` 已经因为**大字符串 IPC 触发 `STATUS_HEAP_CORRUPTION`**
  而不得不分块 512KB 写文件（`src/export/index.ts:132` 注释明确写了原因）。
- 内联图片后的 HTML 文档**动辄数 MB**（`inlineImages` 会把每张本地图转成 base64 data URL）。
- 把数 MB 塞进 `emitTo` 的 payload，等于重新踩同一个坑。
- Tydora 已开 `assetProtocol.enable: true` + Cargo `protocol-asset` feature，
  `convertFileSrc(tmpPath)` → `asset://localhost/...` 可直接 `fetch`，**零新增依赖、零 Rust 改动**。

> MarkFlowy 不走这条路，是因为它传的是 `innerHTML` 且图片走 blob→dataURL 后体量可控；
> Tydora 走这条路，是因为它**已经有 `STATUS_HEAP_CORRUPTION` 的前车之鉴**。这是本方案对参考实现的主要改良点。

---

## 五、文件改动清单

### 5.1 新增文件

| 路径 | 说明 | 来源 |
| --- | --- | --- |
| `src/export/pdfPrint/pdfPrintWindow.ts` | 事件名常量 + 窗口 label 生成 + `openPdfPrintWindow()` 握手 | 移植 `pdf-pdfPrintWindow.ts`，label 前缀改 `tydora-pdf-print` |
| `src/export/pdfPrint/PdfPrintController.ts` | 主窗口侧：序列化 HTML → 写临时文件 → 建窗 → 发数据 → 等结果 → 清理 | 移植 `PdfPrintController.tsx`，去掉 `Preview` 组件依赖，改为接收已构建好的 HTML |
| `src/export/pdfPrint/PdfPrintWindow.tsx` | 打印窗口侧：收 assetUrl → fetch → 拆 style/body → 注入 → 准备 → print → 回传结果 → destroy | 移植 `PdfPrintWindowApp.tsx` |
| `src/export/pdfPrint/printDocument.ts` | `preparePrintDocument` / `invokeSystemPrint` / `replaceInteractiveMedia` / `waitForPrintLayout` | 移植，去掉 `makePrintDocumentTransferable`（Tydora 的 `inlineImages` 已经是 data URL，无 blob 失效问题） |
| `src/export/pdfPrint/printDialogCompletion.ts` | 系统打印对话框关闭检测（4 路信号） | **原样移植** |
| `src/export/pdfPrint/pdf-print.css` | 离屏容器 + `@media print` 分页规则 + `@page { margin: 16mm }` | 移植，选择器改 Tydora 的（`.export-page` / `.tiptap-export-content`） |

### 5.2 修改文件

| 路径 | 改动 | 风险 |
| --- | --- | --- |
| `src/main.tsx` | `Root()` 增加 `isPdfPrintWindow = urlParams.get("window") === "pdf-print"` 分支，渲染 `<PdfPrintWindow />`；**且该分支跳过 `VimProvider`/`App` 的 lazy 加载** | 低（现有分支结构照抄） |
| `src/export/index.ts` | `case "pdf"` 改为返回 `{ printJob }` 而非 `bytes`；`BuiltArtifact` 增加可选 `printJob` 字段；`saveExportArtifact` 对 pdf 不再走写文件 | 中（需同步改 `ExportPreviewDialog` 与 `App.tsx`） |
| `src/export/exporters.ts` | `buildHtmlDoc` 增加 `printOptimized` 选项：追加打印分页 CSS、移除 `.export-page` 阴影/圆角/外边距；**保留** `exportPdfBytes` 但标记为 deprecated（见 §六） | 低 |
| `src/App.tsx` | `handleExport("pdf")` 分叉：不再 `setExportPreview`，改为调用 `requestPdfPrint(ctx)`；命令面板/菜单入口文案与行为对齐 | 中 |
| `src/components/ExportPreviewDialog.tsx` | pdf 格式走新流程；`buildPdfPreviewHtml()` 约 240 行分页 JS 脚本**可删除**（浏览器原生分页已接管） | 中（删除面较大，建议分步） |
| `src-tauri/capabilities/default.json` | 新增 `"core:webview:allow-create-webview-window"`（必需）、`"core:webview:allow-print"`（可选） | 低 |
| `package.json` | 移除 `jspdf`；**保留** `html2canvas`（PNG 导出仍用，见 §六） | 低 |

### 5.3 不动的文件

- `src-tauri/**`（Rust 无需改动，**不需要重编 Rust**）—— 这是本方案相对"走 Rust 建窗命令"的最大工程优势
- `src/export/dom.ts` / `docx.ts`（全部复用）
- `src/i18n/locales/*.json`（文案 key 可全部复用）

---

## 六、UX 决策（需你拍板）

### 6.1 替换还是共存？

| 选项 | 说明 | 建议 |
| --- | --- | --- |
| **A. 完全替换** | "导出为 PDF" 直接弹系统打印对话框，删掉 `ExportPreviewDialog` 的 PDF 分支与 `exportPdfBytes` | ✅ **推荐** —— 与 MarkFlowy 一致，代码净减约 700 行（`exportPdfBytes` ~60 + `findSafePageBreaks` 系列 ~340 + `buildPdfPreviewHtml` ~240 + CSS） |
| B. 共存 | 保留旧路径为"导出为 PDF（位图）"，新增"打印/导出为 PDF" | 改动小，但两套分页逻辑长期维护成本高，且用户分不清 |
| C. 渐进 | 先做 A，但用设置项 `pdfEngine: native \| raster` 保留回退开关，观察一个版本后删 | 稳妥，适合对打印效果没把握时 |

> 建议 **C 起步、A 收尾**：加一个隐藏设置项 `export.pdfEngine`，默认 `native`，出问题可一键切回。

### 6.2 预览对话框去留

MarkFlowy 无预览，直接弹打印。Tydora 现有 `ExportPreviewDialog` 的用户习惯已养成。
建议：**PDF 走打印后不再弹预览**（系统打印对话框本身就有预览），
但在主窗口状态栏给一个轻量 toast："已打开打印对话框，可在其中选择『另存为 PDF』"。

### 6.3 `html2canvas` / `jspdf` 处置

- `jspdf` → **删除**（`exportPdfBytes` 唯一使用者）
- `html2canvas` → **保留**，PNG 导出（`renderToCanvas` / `renderToPng`）仍在用
- 同时可移除 `vite.config.ts` 里若有的相关 manualChunks 条目（当前无，跳过）

---

## 七、候选方案对比（已评估）

| 方案 | 做法 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- | --- |
| A | 打印窗口用 `document.write(html)` 换掉整个文档 | 最贴近"独立文档"语义 | `document.write` 会销毁 JS 上下文 → Tauri `listen()` 回调失效，结果回传需新增 Rust 命令 → **要重编 Rust** | ❌ |
| B | 打印窗口渲染 `<iframe src="asset://...">`，对 iframe 调 `print()` | 隔离最好 | macOS 用 WKWebView，**iframe 打印支持不可靠** | ❌ |
| C | 走 Rust `open_pdf_print_window` 命令建窗 | 与 Tydora 现有建窗约定一致，可做 macOS overlay 美化 | **要改 Rust + 重编**（Tydora Rust 依赖重，迭代慢）；且打印窗口本就不可见，美化无意义 | ⚠️ 备选 |
| **D** | **沿用 `?window=pdf-print` 路由 + `dangerouslySetInnerHTML` + 临时文件传内容** | 改前端即可、不重编 Rust；React 存活 → 事件可用；top-level `window.print()` 最可靠；payload 只有 URL | 需在打印窗口内手动重建 `<style>` 与 `data-theme` | ✅ **推荐** |

---

## 八、风险与对策

| # | 风险 | 影响 | 对策 |
| --- | --- | --- | --- |
| 1 | **大内容 IPC** | `STATUS_HEAP_CORRUPTION`（Tydora 已发生过） | 临时文件 + `asset://`，payload 只传 URL（§4.2） |
| 2 | **暗色主题打印** | 暗底白字打印出来是黑页 / 费墨 | 打印窗口强制 `data-theme` 走浅色；`pdf-print.css` 里 `@media print` 覆写 `--bg-primary: #fff; --text-primary: #1f2330`；提供"打印时强制浅色"设置项 |
| 3 | **图片未加载完就 print** | 打印出空白图 | 移植 `preparePrintDocument`：等 `document.fonts.ready` + 所有 `img.complete` + 15s 超时；Tydora 的 `inlineImages` 已是 data URL，同步解码，风险低于 MarkFlowy |
| 4 | **打印对话框检测不准** | 窗口提前销毁 / 卡死不销毁 | 移植 `printDialogCompletion.ts` 的 4 路信号 + 30 分钟兜底超时 |
| 5 | **临时文件清理** | `$TMPDIR` 堆积 | 打印结束/失败/窗口销毁三处都清理；启动时清理 `tydora-pdf-print/` 下超过 24h 的残留 |
| 6 | **Mermaid / KaTeX 打印布局** | 图表被截断或溢出 | `@media print` 里给 `svg` 加 `max-width: 100%; break-inside: avoid`；mermaid 容器去掉固定高度 |
| 7 | **代码块跨页** | 长代码块被裁断 | `pre { white-space: pre-wrap; overflow: visible; break-inside: auto }`（MarkFlowy 已验证）；可选给 `pre` 加 `break-inside: avoid` 但需防超页 |
| 8 | **Windows WebView2 打印差异** | 行为与 macOS 不一致 | 三端各测一遍；`core:webview:allow-print` 一并提供作为兜底 |
| 9 | 权限缺失导致建窗失败 | 静默失败 | `openPdfPrintWindow` 包 try/catch，失败时 toast 提示并**回退到旧位图方案**（配合 §6.1 的 `pdfEngine` 开关） |

---

## 九、回滚预案

1. **设置项回退**：`export.pdfEngine = "raster"` 立即恢复旧位图方案（§6.1 选项 C）。
2. **Git 回滚**：所有新增文件集中在 `src/export/pdfPrint/`，删除该目录 + revert 5.2 的修改文件即可完整回退；`src-tauri` 仅 `capabilities/default.json` 一行新增，revert 无成本。
3. **不删旧的**：`exportPdfBytes` 与 `ExportPreviewDialog` 的 PDF 分支**先保留一个版本**，确认新方案稳定后再删。

---

## 十、实施步骤（建议顺序）

1. **权限与骨架**：`capabilities/default.json` 加建窗权限 → 新建 `src/export/pdfPrint/` 目录，移植 `printDialogCompletion.ts`（无依赖，纯逻辑）
2. **打印窗口可跑通**：`main.tsx` 加 `pdf-print` 分支 → `PdfPrintWindow.tsx` → 先用**硬编码的假 HTML** 验证能弹打印对话框并能另存为 PDF（打通最小闭环）
3. **接真实内容**：`buildHtmlDoc` 加 `printOptimized` → `PdfPrintController` 写临时文件 → 握手传 `assetUrl` → 打印窗口 fetch + 注入
4. **分页与主题调优**：`pdf-print.css` 对齐 Tydora 选择器；暗色主题浅色化；mermaid / katex / 代码块 / 表格逐项验证
5. **UX 收口**：`handleExport("pdf")` 改道 → 删除 `ExportPreviewDialog` 的 PDF 分支与 `buildPdfPreviewHtml` → 移除 `jspdf`
6. **三端验证**：macOS / Windows / Linux 各测一遍打印与另存；确认临时文件清理

---

## 附：验证清单

- [ ] 纯文本文档 → 文字可选、可搜索、可复制
- [ ] 含 10+ 张本地大图 → 全部出现、无空白、临时文件已清理
- [ ] 含 mermaid 流程图 / katex 公式 → 不截断、不溢出
- [ ] 长表格（跨 3 页以上）→ `thead` 每页重复
- [ ] 超长代码块（跨页）→ 不裁断
- [ ] 任务列表 → 复选框 SVG 正常
- [ ] 暗色主题 → 打印为浅底黑字
- [ ] 取消打印对话框 → 主窗口不卡死，打印窗口已销毁
- [ ] 快速连续点两次导出 → 不产生僵尸窗口
- [ ] 产物体积对比：新旧各导出同一文档，记录体积差
