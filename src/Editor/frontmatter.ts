// ── YAML Frontmatter 解析工具 ──

export interface FrontmatterData {
  [key: string]: unknown;
}

/** 从 Markdown 字符串提取 frontmatter 和正文 */
export function extractFrontmatter(markdown: string): {
  frontmatter: string | null;
  body: string;
} {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (match) {
    return {
      frontmatter: match[1],
      body: markdown.slice(match[0].length),
    };
  }
  return { frontmatter: null, body: markdown };
}

/** 简单 YAML 解析（仅支持标量键值对，无需外部依赖） */
export function parseFrontmatter(yaml: string): FrontmatterData {
  const result: FrontmatterData = {};
  const lines = yaml.split("\n");
  for (const line of lines) {
    const m = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (m) {
      const key = m[1];
      let value: string = m[2].trim();
      // 移除引号包裹
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }
  return result;
}
