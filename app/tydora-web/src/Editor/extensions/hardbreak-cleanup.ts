import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Transaction, EditorState } from "@tiptap/pm/state";
import { Node } from "@tiptap/pm/model";

/**
 * 内联原子节点类型列表，这些节点前后的 hardBreak 需要被自动清理
 * 防止 Shift+Enter 在卡片/标签/链接前后产生多余空行
 */
const INLINE_ATOM_TYPES = new Set(["tag", "wikiLink", "image"]);

function removeHardBreaksAroundInlineAtoms(state: EditorState): Transaction | null {
  const { tr, doc } = state;
  let modified = false;

  doc.descendants((node: Node, pos: number) => {
    if (!INLINE_ATOM_TYPES.has(node.type.name)) return true;

    // 检查节点前面的 hardBreak
    const $before = doc.resolve(pos);
    const nodeBefore = $before.nodeBefore;
    if (nodeBefore?.type.name === "hardBreak") {
      const deleteFrom = pos - nodeBefore.nodeSize;
      tr.delete(deleteFrom, pos);
      modified = true;
    }

    // 检查节点后面的 hardBreak
    const endPos = pos + node.nodeSize;
    const $after = doc.resolve(endPos);
    const nodeAfter = $after.nodeAfter;
    if (nodeAfter?.type.name === "hardBreak") {
      tr.delete(endPos, endPos + nodeAfter.nodeSize);
      modified = true;
    }

    return true;
  });

  return modified ? tr : null;
}

/**
 * HardBreak 清理扩展
 * 自动移除内联原子节点（tag, wikiLink, image）前后的残留 hardBreak 节点。
 *
 * 对应 Flowix 中 noteReference / fileAttachment 的清理逻辑：
 * onCreate() + appendTransaction 中调用 removeHardBreaksAround*
 */
export const HardBreakCleanup = Extension.create({
  name: "hardBreakCleanup",

  onCreate() {
    const tr = removeHardBreaksAroundInlineAtoms(this.editor.state);
    if (tr?.docChanged) {
      try {
        const ed = this.editor;
        if (!ed.isDestroyed && ed.view) {
          ed.view.dispatch(tr);
        }
      } catch {
        /* 视图未就绪/已销毁时忽略 */
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("hardBreakCleanup"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          return removeHardBreaksAroundInlineAtoms(newState);
        },
      }),
    ];
  },
});
