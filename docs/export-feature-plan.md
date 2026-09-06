# Tydora 导出功能实现方案

> 适用范围：顶部栏「更多」按钮 → 新增「导出」菜单项，将**当前 Markdown 笔记**导出为 PDF / HTML / Word(.docx) / 图片(PNG)。
> 本文档为方案与计划，**不含任何代码改动**。

---

## 1. 背景与目标

Tydora 是一个基于 Tauri v2 + React 19 的桌面 Markdown 编辑器（项目内代号 `zmd`），使用 TipTap 3 作为 WYSIWYG 编辑器、CodeMirror 6 作为源码编辑器，并支持 Mermaid 图表、markmap 思维导图、Callout、Wiki-Link、代码高亮、本地图片等富内容。

当前顶部栏「更多」菜单（`src/App.tsx:1636`）仅含「后退 / 前进」。目标是在该菜单中新增「导出」入口，支持四种格式：

- PDF
- HTML
- Word（.docx）
- 图片（PNG，及可选 SVG）

---

## 2. 现状调研

### 2.1 内容模型（导出必须覆盖的元素）


| 要素                       | 当前实现                                                                | 导出注意点                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 正文                       | TipTap HTML / Markdown（通过`tiptap-markdown` 双向转换）                | 需脱离编辑器 DOM 单独渲染                                                                                |
| Mermaid 图表               | `mermaid` 库，节点视图异步渲染为 **SVG**                                | 可用`mermaid.render(id, code)` 直接拿到 SVG 字符串                                                       |
| 思维导图                   | `markmap-lib` + `markmap-view`，渲染为 **SVG**                          | 可捕获已渲染 SVG                                                                                         |
| Callout / 标签 / Wiki-Link | 自定义 TipTap 扩展                                                      | 需在导出渲染器中实现等价样式；Wiki-Link 跨文件解析**不在本期范围**                                       |
| 代码高亮                   | `lowlight` + `highlight.js`                                             | 需把高亮样式内联进导出 HTML                                                                              |
| 本地图片                   | `ImageManager`，存于 vault 的 `assets/` 或固定目录，引用为相对/绝对路径 | 导出需读取文件并转为`data:` URI 内联，保证自包含                                                         |
| 主题                       | 8 套内置主题 + 自定义主题；`document.documentElement.dataset.theme`     | ⚠️**自定义主题支持 `oklch()` 颜色**（`src/themes/CustomThemeManager.ts:121`、 `src/Settings.tsx:728`） |

### 2.2 已有可复用能力

- Tauri 插件已具备：`@tauri-apps/plugin-dialog`（保存对话框）、`@tauri-apps/plugin-fs`（写文件）、`@tauri-apps/plugin-opener`（打开文件）。
- `mermaid`、`markmap-*`、`highlight.js` 均已在前端就绪，可直接用于导出渲染。
- 「发布（publish）」功能使用 `@abstractwebunit/markdown-publish` CLI 做整站构建，**其输出是整站而非单篇文档，且为 CLI 进程，不直接复用**；但可参考其 Markdown→HTML 的扩展处理思路。

### 2.3 关键风险：现代 CSS 颜色函数

主题允许 `oklch()` 颜色值。这对栅格化方案有决定性影响：

- `html2canvas` 会**重新解析 computed style**，遇到 `oklch()/lab()/color()` 直接失败或渲染成黑色/错误色。
- `html-to-image`（基于浏览器原生 foreignObject 渲染）由 WebView 引擎渲染，**原生支持现代颜色函数**。
- WebView 原生 `window.print()` 由 Chromium/WebView2 渲染，**原生支持现代颜色函数**。

> 结论：**优先选用基于浏览器原生渲染的路线（html-to-image / 原生打印），规避 html2canvas。**

---

## 3. 总体架构：统一「导出文档」构建器

四种格式共享一个前置步骤——把当前笔记渲染成一份**自包含的 HTML 文档**（single-file HTML），再各自落盘。

```
当前笔记内容
   │
   ▼
ExportDocumentBuilder
   ├─ 用与编辑器一致的扩展把 Markdown→HTML（Callout/标签/Wiki-Link 占位）
   ├─ Mermaid：mermaid.render() → 内联 <svg>
   ├─ 思维导图：捕获 markmap <svg> 内联
   ├─ 代码高亮：内联 highlight.js 样式
   ├─ 图片：Tauri fs 读取 → base64 data: URI 内联
   └─ 注入主题 CSS（编辑器样式 + 当前主题变量）
   │
   ▼  导出文档 (string HTML)
   ├─▶ HTML：直接写文件
   ├─▶ PDF ：浏览器原生打印 或 jsPDF+html-to-image（栅格兜底）
   ├─▶ DOCX：html-to-docx 转换
   └─▶ 图片：html-to-image → PNG（可选 SVG 直出）
```

该构建器作为纯前端模块 `src/export/` 实现，所有渲染都在 WebView 内完成（Mermaid/markmap 只能在 JS 环境渲染，Rust 端无法实现等价渲染，因此**导出逻辑放前端**而非 Rust 命令）。

---

## 4. 各格式技术选型与对比

### 4.1 HTML 导出


| 方案                        | 说明                                              | 优劣                                                      |
| ----------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| **单文件内联 HTML（推荐）** | 把 CSS、图片(data URI)、SVG 全部内联到一个`.html` | ✅ 自包含、双击即开、可移植；✅ 实现最简单；⚠️ 文件略大 |
| HTML + assets 文件夹        | 图片作为外部文件与 html 同目录                    | ✅ 文件小；⚠️ 需保证相对路径、易丢失                    |

**推荐：单文件内联 HTML。** 利用已构建的「导出文档」直接 `dialog.save` + `fs.writeTextFile`。

### 4.2 PDF 导出


| 方案                                     | 原理                                                                                                  | 优点                                                                                       | 缺点                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **A. 浏览器原生打印（推荐主方案）**      | 在隐藏 WebView 窗口加载导出 HTML，调用`window.print()`，用户选「Microsoft Print to PDF / 导出为 PDF」 | ✅**矢量**、文字可选中、超链接/目录有效；✅ 完美支持 oklch/复杂 CSS；✅ 零额外依赖、跨平台 | ⚠️ 弹出系统打印对话框，非「一键存到指定路径」；需处理`@page` 分页与打印 CSS |
| **B. jsPDF + html-to-image（栅格兜底）** | 用 html-to-image 把文档栅格化为 canvas，再塞进 jsPDF 分页                                             | ✅ 可完全静默保存到用户选的路径（无对话框）；✅ 可控分页                                   | ⚠️ 栅格化：文字不可选中、大文档体积大；需手工分页拼接                       |

**推荐：以方案 A（原生打印）为默认高质量路径**，方案 B 作为「直接保存、不要对话框」的备选。两者输入都是同一份导出 HTML，可共存。

> 说明：Tauri v2 暂无官方「一键无对话框 print-to-PDF」API；若未来要彻底规避打印对话框，可评估社区 `tauri-plugin-printer`（基于系统打印，仍偏打印而非高质量排版）。本期不引入该插件，优先用原生打印保证保真度。

### 4.3 Word / DOCX 导出


| 方案                               | 说明                                                         | 优点                                                   | 缺点                                                                     |
| ------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| **html-to-docx（推荐）**           | 把导出 HTML 转为符合 OOXML 的`.docx`，支持图片内嵌、基础样式 | ✅ 现代、活跃维护；✅ Word 兼容性好；✅ 浏览器内可运行 | ⚠️ 复杂 CSS（如 flex 布局、Callout 阴影）未必 1:1 还原，需简化导出样式 |
| html-docx-js（旧）                 | 老牌 HTML→DOCX                                              | ✅ 轻量                                                | ❌ Word 兼容性差（已知问题）、样式丢失多                                 |
| mammoth                            | **仅支持 docx→HTML**，方向反了                              | —                                                     | ❌ 不适用于本需求                                                        |
| docx（dolanmiu）                   | 编程式构建文档模型                                           | ✅ 完全可控                                            | ❌ 需把富 HTML 手工映射为文档对象，工作量巨大                            |
| 「HTML 改后缀 .doc」（零依赖兜底） | 把导出 HTML 以`.doc` + Word MIME 保存                        | ✅ 零依赖、图片/样式保真度高                           | ⚠️ 实为 HTML 伪装，Word 打开有兼容性提示；非真正 .docx                 |

**推荐：主用 `html-to-docx` 生成真正的 `.docx`**；导出 HTML 中对 Callout/代码块等用「语义化 + 基础内联样式」以适配 Word。保留「.doc(HTML)」作为兜底选项可选。

### 4.4 图片导出


| 方案                      | 原理                                          | 优点                                                      | 缺点                                                  |
| --------------------------- | ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------- |
| **html-to-image（推荐）** | 用浏览器原生 foreignObject 渲染整篇文档为图片 | ✅**支持 oklch 等现代颜色**；✅ 还原度高；✅ 长图整页截取 | ⚠️ 个别 CSS（如`box-shadow` 复杂滤镜）可能被简化    |
| html2canvas               | 遍历 DOM 重绘 canvas                          | ✅ 生态老                                                 | ❌**不支持 oklch/lab，主题色会错**；对现代 CSS 支持差 |

**推荐：html-to-image。** 对「导出文档」容器调用 `toPng({ pixelRatio: 2~3 })` 生成 PNG 长图；额外提供 **SVG 直出**（直接序列化文档中的 SVG，矢量、体积小）作为加分项。

> 注：图片导出是「整篇笔记截图」，非逐段；若需「仅某图/某图」可在节点上右键单独导出（本期不实现，仅记录为扩展点）。

---

## 5. 推荐方案总览


| 格式 | 采用技术                                                        | 输入     | 输出方式                                    |
| ------ | ----------------------------------------------------------------- | ---------- | --------------------------------------------- |
| HTML | 自包含内联 HTML                                                 | 导出文档 | `plugin-dialog` 选路径 + `plugin-fs` 写文本 |
| PDF  | WebView 原生`window.print()`（主）；jsPDF+html-to-image（备选） | 导出文档 | 系统打印对话框 / 静默保存                   |
| DOCX | `html-to-docx`                                                  | 导出文档 | 同上写二进制                                |
| 图片 | `html-to-image` → PNG（SVG 直出可选）                          | 导出文档 | 同上写二进制                                |

统一依赖（前端，`npm` 安装，无需新增 Rust 插件）：

- `html-to-image`
- `html-to-docx`
- `jspdf`（仅 PDF 备选栅格路径需要）
- 已有：`@tauri-apps/plugin-dialog`、`@tauri-apps/plugin-fs`、`mermaid`、`markmap-lib`、`highlight.js`

---

## 6. 详细实现计划（步骤，不改代码，仅描述）

### 6.1 UI 改动（App.tsx 顶部「更多」菜单）

1. 在 `src/App.tsx` 的 `editor-topbar-more-menu`（`src/App.tsx:1644`）中，于「后退/前进」之后新增一个**「导出」子菜单**（hover 展开或二级菜单）。
2. 子菜单四项：
   - 导出为 PDF
   - 导出为 HTML
   - 导出为 Word (.docx)
   - 导出为图片 (PNG)
   - （可选）导出为图片 (SVG)
3. 点击后关闭菜单并调用 `src/export/` 对应导出函数；导出中显示 loading 态（复用现有顶部进度条或 toast 模式）。
4. 非 Markdown 文件（如打开的是代码文件）时，禁用导出项或仅允许 HTML/图片。

### 6.2 新增模块 `src/export/`

- `buildExportDocument.ts`：核心构建器。
  - 入参：当前 `content`（Markdown）、当前主题、当前文件路径、vault 路径、图片设置。
  - 调 `tiptap-markdown`/现有 Markdown→HTML 管道得到带扩展的 HTML。
  - 把 `data-type="mermaid"` 节点替换为 `mermaid.render()` 的 SVG。
  - 把 markmap 思维导图节点替换为已渲染 SVG。
  - 用 Tauri `plugin-fs` 读取本地图片 → `data:image/...;base64,...` 内联。
  - 拼接 `<style>`：主题 CSS 变量 + 编辑器/代码高亮样式 + 打印样式。
  - 返回 `{ html: string, title: string }`。
- `exportHtml.ts`：保存为 `.html`（单文件内联）。
- `exportPdf.ts`：方案 A（打开隐藏窗口加载 HTML → `window.print()`）；方案 B（html-to-image + jsPDF）。
- `exportDocx.ts`：`html-to-docx` 转换并保存 `.docx`。
- `exportImage.ts`：`html-to-image` 导出 PNG / SVG。
- `index.ts`：导出统一入口与格式枚举。

### 6.3 文件保存流程（通用）

```
dialog.save({ defaultPath: `${title}.pdf`, filters: [...] })
  → 拿到用户路径
  → 生成对应二进制/文本
  → fs.writeFile / writeTextFile
  → opener.open(path) 可选「导出后打开」
```

### 6.4 样式与保真要点

- 导出专用 CSS 类（如 `.export-doc`），与编辑器运行时样式隔离，避免把编辑工具栏/选中态带出。
- 代码块用内联 `highlight.js` class + `<style>`，保证 Word/HTML 都有高亮。
- Callout 用语义化 `blockquote` + 基础背景色，兼顾 Word 兼容。
- 处理主题色：导出 HTML 强制以 `rgb/hex` 计算（`getComputedStyle` 取到的本就是 rgb，浏览器已规范化），因此 oklch 风险在「导出文档」层天然消除——这也进一步说明**基于浏览器渲染的路线最稳妥**。

### 6.5 边界与降级

- 超大文档：PDF 打印分页交给浏览器；PNG 长图注意内存，可分页或限制最大高度。
- Mermaid 渲染失败：捕获异常，保留源代码块并提示，不中断整体导出。
- 图片读取失败（路径失效）：替换为占位图，继续导出。

---

## 7. 风险与应对


| 风险                         | 影响                 | 应对                                                   |
| ------------------------------ | ---------------------- | -------------------------------------------------------- |
| 主题使用`oklch()`            | html2canvas 渲染错色 | 禁用 html2canvas；统一用 html-to-image / 原生打印      |
| Mermaid/Markmap 异步渲染时序 | SVG 未就绪就截图     | 构建器内显式`await mermaid.render()` 后再序列化        |
| Word 对复杂 CSS 还原有限     | Callout/分栏样式丢失 | 导出样式做「Word 友好」简化（语义化标签+内联基础样式） |
| 长文 PNG 内存占用            | 卡顿/崩溃            | 限制 pixelRatio；超大文档提示用 PDF                    |
| Wiki-Link 跨文件解析         | 导出后链接失效       | 本期将 Wiki-Link 渲染为纯文本/锚点，跨文件收集不在范围 |

---

## 8. 验收标准

1. 顶部「更多」菜单出现「导出」子菜单，含 PDF/HTML/Word/图片 四项。
2. 四种格式均可从当前 Markdown 笔记成功导出，文件可被对应程序正常打开。
3. 导出产物包含：正文、代码高亮、Mermaid 图（矢量）、Callout、本地图片（自包含）。
4. 使用含 `oklch()` 自定义主题时，颜色渲染正确（不出现黑色/错色）。
5. 导出过程中 UI 有反馈，失败有提示且不崩溃编辑器。

---

## 9. 范围说明（本期不做）

- Canvas / 关系图谱视图的导出（其内容为 React Flow / d3，需单独方案）。
- 批量/整库导出、跨文件 Wiki-Link 收集。
- 导出模板自定义、页眉页脚配置（可作为后续增强）。
