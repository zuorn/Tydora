// src/WikiLinkProcessor.ts

const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;
const WIKI_EMBED_REGEX = /!\[\[([^\]]+)\]\]/g;

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'TD', 'TH', 'FIGCAPTION', 'DT', 'DD',
]);

/**
 * 处理 DOM 中的 wiki 链接
 * 找到所有包含 [[...]] 的文本节点并转换为链接元素
 */
export function processWikiLinksInDOM(container: HTMLElement): void {
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node: Text) => {
        // 跳过代码块和已经处理过的链接
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('pre, code, .wiki-link, .wiki-embed, .vditor-toolbar, .wiki-link-pending')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.textContent || !node.textContent.includes('[[')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    processTextNode(textNode);
  }

  // 处理 IR 模式：[[...]] 可能被 Vditor 拆分到多个 DOM 节点中
  processBlockLevelWikiLinks(container);
}

/**
 * IR 模式兜底：在段落级容器中查找跨节点的 [[...]] 并着色
 */
function processBlockLevelWikiLinks(container: HTMLElement): void {
  const blocks = container.querySelectorAll<HTMLElement>(
    Array.from(BLOCK_TAGS).join(',')
  );

  for (const block of blocks) {
    // 跳过已处理的块
    if (block.querySelector('.wiki-link-pending')) continue;
    // 跳过包含 <a.wiki-link> 的块（已由 processTextNode 处理）
    if (block.querySelector('a.wiki-link')) continue;
    // 跳过代码块
    if (block.closest('pre, code')) continue;

    const fullText = block.textContent || '';
    if (!fullText.includes('[[')) continue;

    // 收集所有文本节点及其起始偏移
    const textNodes: { node: Text; start: number }[] = [];
    let pos = 0;
    const tw = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    let tn: Text | null;
    while ((tn = tw.nextNode() as Text | null)) {
      textNodes.push({ node: tn, start: pos });
      pos += tn.textContent!.length;
    }

    // 匹配 [[...]]
    const re = /\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    const wraps: Range[] = [];

    while ((m = re.exec(fullText)) !== null) {
      const matchStart = m.index;
      const matchEnd = m.index + m[0].length;

      const startInfo = textNodes.find(n => n.start + (n.node.textContent?.length || 0) > matchStart);
      const endInfo = textNodes.find(n => n.start + (n.node.textContent?.length || 0) >= matchEnd);
      if (!startInfo || !endInfo) continue;

      try {
        const r = document.createRange();
        r.setStart(startInfo.node, Math.max(0, matchStart - startInfo.start));
        r.setEnd(endInfo.node, Math.max(0, Math.min(matchEnd - endInfo.start, endInfo.node.textContent?.length || 0)));
        wraps.push(r);
      } catch {
        // 忽略 Range 错误
      }
    }

    // 从后往前替换，避免偏移量变化
    for (let i = wraps.length - 1; i >= 0; i--) {
      const range = wraps[i];
      const text = range.toString();
      const inner = text.slice(2, -2); // 去掉 [[ 和 ]]

      const span = document.createElement('span');
      span.className = 'wiki-link wiki-link-pending';
      span.dataset.note = inner.split('#')[0].split('|')[0];
      span.dataset.heading = inner.includes('#') ? inner.split('#')[1]?.split('|')[0] : '';
      span.textContent = text;
      span.style.color = 'var(--accent)';
      span.style.borderBottom = '1px dashed var(--accent)';
      span.style.cursor = 'pointer';

      range.deleteContents();
      range.insertNode(span);
    }
  }
}

/**
 * 处理单个文本节点，将 [[...]] 转换为链接
 */
function processTextNode(textNode: Text): void {
  const text = textNode.textContent || '';
  
  // 检查是否包含 wiki 链接语法
  if (!text.includes('[[')) return;
  
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  
  // 重置正则
  WIKI_LINK_REGEX.lastIndex = 0;
  WIKI_EMBED_REGEX.lastIndex = 0;
  
  // 合并匹配结果并按位置排序
  const matches: Array<{ start: number; end: number; content: string; isEmbed: boolean }> = [];
  
  let match: RegExpExecArray | null;
  while ((match = WIKI_LINK_REGEX.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      content: match[1],
      isEmbed: false,
    });
  }
  
  while ((match = WIKI_EMBED_REGEX.exec(text)) !== null) {
    // 跳过已匹配的 ![[...]]，因为上面的 [[...]] 正则也会匹配到内部的 [...]
    // 但我们需要的是 ![[...]] 整体
    const fullMatch = match[0];
    const embedStart = match.index;
    matches.push({
      start: embedStart,
      end: embedStart + fullMatch.length,
      content: match[1],
      isEmbed: true,
    });
  }
  
  // 去重并排序
  const uniqueMatches = matches
    .filter((m, i, arr) => arr.findIndex(x => x.start === m.start) === i)
    .sort((a, b) => a.start - b.start);
  
  if (uniqueMatches.length === 0) {
    fragment.appendChild(document.createTextNode(text));
  } else {
    for (const m of uniqueMatches) {
      // 添加链接前的文本
      if (m.start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, m.start)));
      }
      
      // 解析链接内容
      const { noteName, heading, alias } = parseWikiLinkContent(m.content);
      const display = alias || noteName;
      
      if (m.isEmbed) {
        // 嵌入内容显示为引用块
        const embed = document.createElement('blockquote');
        embed.className = 'wiki-embed';
        embed.dataset.note = noteName;
        embed.dataset.heading = heading || '';
        
        const content = document.createElement('div');
        content.className = 'wiki-embed-content';
        content.textContent = `加载中...`;
        
        const source = document.createElement('div');
        source.className = 'wiki-embed-source';
        source.textContent = `— ${noteName}`;
        
        embed.appendChild(content);
        embed.appendChild(source);
        fragment.appendChild(embed);
      } else {
        // 普通链接
        const link = document.createElement('a');
        link.className = 'wiki-link';
        link.href = `wikilink://${encodeURIComponent(noteName)}${heading ? `#${encodeURIComponent(heading)}` : ''}`;
        link.dataset.note = noteName;
        link.dataset.heading = heading || '';
        link.textContent = display;
        fragment.appendChild(link);
      }
      
      lastIndex = m.end;
    }
    
    // 添加最后一段文本
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }
  
  textNode.parentNode?.replaceChild(fragment, textNode);
}

/**
 * 解析 wiki 链接内容
 * 支持格式: 笔记名, 笔记名#标题, 笔记名|别名, 笔记名#标题|别名
 */
function parseWikiLinkContent(content: string): {
  noteName: string;
  heading?: string;
  alias?: string;
} {
  // 分离别名
  const pipeIndex = content.indexOf('|');
  const displayPart = pipeIndex >= 0 ? content.slice(pipeIndex + 1) : undefined;
  const notePart = pipeIndex >= 0 ? content.slice(0, pipeIndex) : content;
  
  // 分离标题
  const hashIndex = notePart.indexOf('#');
  const noteName = hashIndex >= 0 ? notePart.slice(0, hashIndex) : notePart;
  const heading = hashIndex >= 0 ? notePart.slice(hashIndex + 1) : undefined;
  
  return { noteName, heading, alias: displayPart };
}

/**
 * 标记链接目标是否存在（设置 data-exists 属性）
 */
export function markLinkExistence(container: HTMLElement, findFile: (name: string) => string | undefined): void {
  container.querySelectorAll('a.wiki-link[data-note]').forEach(el => {
    const noteName = (el as HTMLElement).dataset.note;
    if (noteName) {
      (el as HTMLElement).dataset.exists = String(findFile(noteName) !== undefined);
    }
  });
}

/**
 * 加载嵌入内容 (![[note]])
 */
export async function loadEmbeds(
  container: HTMLElement,
  findFile: (name: string) => string | undefined,
  readFile: (path: string) => Promise<string>
): Promise<void> {
  const embeds = container.querySelectorAll('blockquote.wiki-embed:not([data-loaded])');

  for (const embed of Array.from(embeds)) {
    const el = embed as HTMLElement;
    const noteName = el.dataset.note;
    if (!noteName) continue;

    el.dataset.loaded = 'true';
    const filePath = findFile(noteName);
    if (!filePath) {
      const content = el.querySelector('.wiki-embed-content');
      if (content) content.textContent = '笔记不存在';
      continue;
    }

    try {
      const fileContent = await readFile(filePath);
      const content = el.querySelector('.wiki-embed-content');
      if (content) {
        // 取前 500 字符作为预览
        content.textContent = fileContent.slice(0, 500);
      }
    } catch {
      const content = el.querySelector('.wiki-embed-content');
      if (content) content.textContent = '加载失败';
    }
  }
}
