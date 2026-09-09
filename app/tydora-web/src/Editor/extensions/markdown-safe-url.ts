/**
 * 将 URL 安全序列化为 Markdown 链接/图片目标。
 *
 * CommonMark（markdown-it 同款解析器）解析 `[text](url)` / `![alt](url)` 时，
 * 目标内出现空白会在空格处截断 URL；`|` 也会被部分解析器当作表格分隔符。
 * GitHub 徽章等 URL（如 `https://img.shields.io/badge/platform-Windows | macOS | Linux-lightgrey`）
 * 含空格与竖线，必须用尖括号 `<url>` 形式包裹才能无损往返。
 *
 * 注意：tiptap-markdown 在解析时会对 href 做 `decodeURIComponent`（`%20`→空格、
 * `%7C`→`|`），因此 doc 里的链接 href 可能已含原始空格/竖线，序列化时必须兜底。
 *
 * 规则：
 * - 含空白或 `|` 的 URL → 包裹为 `<url>`（尖括号内仅不允许 `>` 与换行）；
 * - 其余情况 → 转义反斜杠、括号与方括号，避免破坏 Markdown 语法。
 */
export function serializeMarkdownUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/[\s|]/.test(url) && !/[>\n]/.test(url)) {
    return `<${url}>`;
  }
  return url.replace(/[[\]()\\]/g, "\\$&");
}
