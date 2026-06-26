// src/LinkParser.ts

export interface WikiLink {
  raw: string;           // 原始文本，如 [[笔记名#标题|显示文本]]
  noteName: string;      // 目标笔记名
  heading?: string;      // 锚点标题
  alias?: string;        // 显示文本
  isEmbed: boolean;      // 是否为嵌入 ![[...]]
  startIndex: number;    // 在原文中的起始位置
  endIndex: number;      // 在原文中的结束位置
}

/**
 * 解析 markdown 中的所有 [[...]] 链接
 */
export function parseWikiLinks(markdown: string): WikiLink[] {
  // 匹配 ![[...]] 或 [[...]]
  const regex = /!?\[\[([^\]]+)\]\]/g;
  const links: WikiLink[] = [];
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    const raw = match[0];
    const content = match[1];
    const isEmbed = raw.startsWith('!');

    // 解析 笔记名#标题|显示文本
    const pipeIndex = content.indexOf('|');
    const displayPart = pipeIndex >= 0 ? content.slice(pipeIndex + 1) : undefined;
    const notePart = pipeIndex >= 0 ? content.slice(0, pipeIndex) : content;

    const hashIndex = notePart.indexOf('#');
    const noteName = hashIndex >= 0 ? notePart.slice(0, hashIndex) : notePart;
    const heading = hashIndex >= 0 ? notePart.slice(hashIndex + 1) : undefined;

    links.push({
      raw,
      noteName,
      heading,
      alias: displayPart,
      isEmbed,
      startIndex: match.index,
      endIndex: match.index + raw.length,
    });
  }

  return links;
}
