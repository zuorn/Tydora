import { Extension } from "@tiptap/core";

/**
 * 逐行剥离 Markdown 源文本中的 <style> 块，避免 markdown-it 将其视为 HTML block
 * 从而吞掉后续所有内容（当 </style> 缺失时尤其严重）。
 *
 * 规则：
 * - 跳过围栏代码块（``` / ~~~）内的 <style>，不误删代码示例
 * - 行首 <style>...</style>（单行或多行）整块移除
 * - 行首未闭合的 <style> 标签：仅移除标签本身，保留后续内容
 * - 行内 <style> 标签：仅移除标签本身
 */
export function stripStyleBlocks(src: string): string {
  const lines = src.split("\n");
  const result: string[] = [];
  let inFencedCode = false;
  let inStyleBlock = false;

  for (const line of lines) {
    // 围栏代码块边界检测
    if (/^\s*(```|~~~)/.test(line)) {
      inFencedCode = !inFencedCode;
      result.push(line);
      continue;
    }

    if (inFencedCode) {
      result.push(line);
      continue;
    }

    // 处于 <style> 块内部：跳过直到遇到 </style>
    if (inStyleBlock) {
      if (/<\/style>/i.test(line)) {
        inStyleBlock = false;
      }
      continue;
    }

    // 行首 <style> 标签（允许前导空白）
    const styleStartMatch = line.match(/^\s*<style\b[^>]*>(.*)$/i);
    if (styleStartMatch) {
      const afterTag = styleStartMatch[1];
      if (/<\/style>/i.test(afterTag)) {
        // 单行 <style>...</style>：整行跳过
        continue;
      } else {
        // 多行 <style> 块开始
        inStyleBlock = true;
        continue;
      }
    }

    // 行内 <style> 标签：仅移除标签本身，保留其余内容
    result.push(line.replace(/<\/?style\b[^>]*>/gi, ""));
  }

  return result.join("\n");
}

/**
 * TipTap 扩展：在 markdown-it 解析前通过 core.ruler 剥离 <style> 块。
 * 与 Frontmatter 扩展使用相同的 parse.setup 机制。
 */
export const StripStyle = Extension.create({
  name: "stripStyle",

  addStorage() {
    return {
      markdown: {
        parse: {
          setup(markdownit: any) {
            markdownit.core.ruler.before("block", "strip_style", (state: any) => {
              state.src = stripStyleBlocks(state.src);
            });
          },
        },
      },
    };
  },
});
