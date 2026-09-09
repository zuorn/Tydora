import { MarkdownSerializerState } from "prosemirror-markdown";

export interface MarkdownPositionMarker {
  /** ProseMirror 文档中的绝对位置 */
  pmPos: number;
  /** 对应 Markdown 源码的字符偏移 */
  md: number;
}

export interface MarkdownPositionMap {
  markers: MarkdownPositionMarker[];
  docSize: number;
}

/**
 * 序列化时直接通过 state.text(..., false) 输出整段文本的块级节点
 * （代码块、frontmatter 等）。这类节点内部没有行内标记，因此在其
 * 文本内容起始/结束处补充标记，使块内的光标也能精确映射。
 */
const PLAIN_TEXT_BLOCK_NODES = new Set(["codeBlock", "code_block", "frontmatter"]);

/**
 * 继承 prosemirror-markdown 的序列化状态，在序列化过程中记录每个
 * ProseMirror 节点边界对应的 Markdown 输出偏移，从而在 IR（所见即所得）
 * 与 SV（源码）之间建立双向的光标位置映射。
 *
 * 说明：与 editor.storage.markdown.serializer 使用的序列化器保持一致，
 * 唯一差异是 tiptap-markdown 针对 expelEnclosingWhitespace 标记（行内代码、
 * 删除线等）做的空白修剪未在此复刻，因此这类标记附近（仅当分隔符两侧存在
 * 空白时）的映射可能有 1~2 个字符的偏差。
 */
class TrackingMarkdownSerializerState extends MarkdownSerializerState {
  constructor(
    nodes: Record<string, (state: MarkdownSerializerState, node: any, parent: any, index: number) => void>,
    marks: Record<string, unknown>,
    options?: { hardBreakNodeName?: string; tightLists?: boolean; strict?: boolean },
  ) {
    // 基类 d.ts 未声明构造函数（TS 视为无参），实际实现接收 (nodes, marks, options?)
    // @ts-expect-error 运行时签名 (nodes, marks, options?)
    super(nodes, marks, options);
  }

  markers: MarkdownPositionMarker[] = [];
  /** doc.descendants 预生成的“节点 → 绝对起始位置”表 */
  private posByNode = new Map<unknown, number>();
  private currentNode: any = null;
  private currentNodePos = 0;

  /**
   * 待落定的节点起始位置。块级节点开始渲染时，前一个块的分隔符（空行、
   * 列表前缀等）尚未通过 flushClose 输出，此刻记录的 md 偏移会偏小；
   * 先把这些位置暂存，待 flushClose 真正输出分隔符后再统一落定，
   * 保证块起始位置的 md 偏移精确。
   */
  private pendingMarkers: number[] = [];

  /** prosemirror-markdown 在运行时维护的输出字符串，d.ts 未声明 */
  declare out: string;
  /** prosemirror-markdown 在运行时维护的“待关闭块”，d.ts 未声明 */
  declare closed: any;

  buildIndex(doc: any) {
    this.posByNode.clear();
    doc.descendants((node: any, pos: number) => {
      this.posByNode.set(node, pos);
    });
  }

  /** 计算节点在文档中的绝对起始位置 */
  private nodeStart(node: any, parent: any, index: number): number | null {
    const pos = this.posByNode.get(node);
    if (pos !== undefined) return pos;
    // 行内渲染时“挤出空白”的文本节点是副本，无法按引用查找，改用父节点推算
    if (!node.isText || !parent) return null;
    const parentPos = this.posByNode.get(parent);
    if (parentPos === undefined) return null;
    let offset = 0;
    for (let i = 0; i < index; i++) offset += parent.child(i).nodeSize;
    return parentPos + 1 + offset;
  }

  private addMarker(pmPos: number | null) {
    if (pmPos === null) return;
    const md = this.out.length;
    const last = this.markers[this.markers.length - 1];
    if (last && last.pmPos === pmPos && last.md === md) return;
    this.markers.push({ pmPos, md });
  }

  /** flushClose 已输出分隔符，此刻落定所有暂存的 marker（md 偏移精确） */
  flushPendingMarkers() {
    if (this.pendingMarkers.length === 0) return;
    const pending = this.pendingMarkers;
    this.pendingMarkers = [];
    for (const pmPos of pending) this.addMarker(pmPos);
  }

  /**
   * 重写 flushClose：透传原逻辑输出块间分隔符后，把暂存的节点起始位置落定。
   * flushClose 未在 d.ts 中声明，因此通过原型调用原实现。
   */
  flushClose(size = 2) {
    const proto = MarkdownSerializerState.prototype as unknown as {
      flushClose: (this: TrackingMarkdownSerializerState, size?: number) => void;
    };
    proto.flushClose.call(this, size);
    this.flushPendingMarkers();
  }

  override render(node: any, parent: any, index: number) {
    const pos = this.nodeStart(node, parent, index);
    const prevNode = this.currentNode;
    const prevPos = this.currentNodePos;
    this.currentNode = node;
    this.currentNodePos = pos ?? 0;
    if (this.closed) {
      // 前一个块尚未 flush，分隔符未输出，暂存待落定
      this.pendingMarkers.push(pos ?? 0);
    } else {
      this.addMarker(pos);
    }
    super.render(node, parent, index);
    this.currentNode = prevNode;
    this.currentNodePos = prevPos;
  }

  override text(text: string, escape?: boolean) {
    const node = this.currentNode;
    const isPlainTextBlock =
      !!node && !escape && PLAIN_TEXT_BLOCK_NODES.has(node.type?.name);
    if (isPlainTextBlock) {
      this.flushPendingMarkers();
      // 块级文本从“节点起始位置 + 1”开始（围栏/分隔线已由 state.write 输出）
      this.addMarker(this.currentNodePos + 1);
    }
    super.text(text, escape);
    if (isPlainTextBlock) {
      this.addMarker(this.currentNodePos + 1 + text.length);
    }
  }
}

/**
 * 基于当前编辑器文档构建位置映射表。
 * 序列化整篇文档一次，记录每个节点边界的 Markdown 偏移。
 */
export function buildPositionMap(editor: { state: any; storage: any }): MarkdownPositionMap {
  const doc = editor?.state?.doc;
  if (!doc) return { markers: [], docSize: 0 };
  const docSize = doc.content.size;
  const serializer = editor?.storage?.markdown?.serializer;
  if (!serializer) return { markers: [], docSize };
  try {
    const state = new TrackingMarkdownSerializerState(
      serializer.nodes,
      serializer.marks,
      { hardBreakNodeName: "hardBreak" },
    );
    state.buildIndex(doc);
    state.renderContent(doc);
    state.flushPendingMarkers();
    const raw = state.markers;
    // 相邻 marker 的 md 相同（如块边界与其后首个文本起点共享同一偏移）时，
    // 只保留 pmPos 较大的那个，保证 markers 的 md 严格递增，从而分段映射
    // 的往返一致（每个 pmPos 唯一对应一个 md 偏移）。
    const markers: MarkdownPositionMarker[] = [];
    for (const m of raw) {
      const last = markers[markers.length - 1];
      if (last && last.md === m.md) {
        markers[markers.length - 1] = m;
      } else {
        markers.push(m);
      }
    }
    const last = markers[markers.length - 1];
    if (!last || last.pmPos !== docSize || last.md !== state.out.length) {
      markers.push({ pmPos: docSize, md: state.out.length });
    }
    return { markers, docSize };
  } catch {
    return { markers: [], docSize };
  }
}

/** 二分查找：第一个满足 key(item) > target 的下标（不存在则返回数组长度） */
function upperBoundIndex<T>(items: T[], target: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(items[mid]) <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * 将 ProseMirror 位置映射为 Markdown 源码偏移。
 *
 * 采用“文本在前、分隔符在后”的分段模型：节点文本与其后输出的标记分隔符
 * （如 **、`、列表前缀、块尾空行等）组成一个片段。片段内按 1:1 线性映射，
 * 分隔符带来的额外长度归并到片段末尾，因此光标落在文本内部时映射是精确的，
 * 只有落在分隔符之间时会被就近吸附到文本边界。
 */
export function pmPosToMdOffset(map: MarkdownPositionMap, pmPos: number): number {
  const { markers, docSize } = map;
  if (markers.length === 0) return 0;
  const pos = Math.max(0, Math.min(pmPos, docSize));
  const idx = upperBoundIndex(markers, pos, (m) => m.pmPos);
  const marker = markers[idx - 1] ?? markers[0];
  const next = markers[idx];
  if (!next) return marker.md + Math.max(0, pos - marker.pmPos);
  const segmentLen = next.pmPos - marker.pmPos;
  return marker.md + Math.min(pos - marker.pmPos, segmentLen);
}

/** 将 Markdown 源码偏移映射回 ProseMirror 位置（与 pmPosToMdOffset 互为逆映射） */
export function mdOffsetToPmPos(map: MarkdownPositionMap, mdOffset: number): number {
  const { markers, docSize } = map;
  if (markers.length === 0) return 0;
  const offset = Math.max(0, mdOffset);
  const idx = upperBoundIndex(markers, offset, (m) => m.md);
  const marker = markers[idx - 1] ?? markers[0];
  const next = markers[idx];
  if (!next) return Math.min(docSize, marker.pmPos + Math.max(0, offset - marker.md));
  const segmentLen = next.pmPos - marker.pmPos;
  const delta = offset - marker.md;
  return Math.min(docSize, marker.pmPos + Math.min(delta, segmentLen));
}
