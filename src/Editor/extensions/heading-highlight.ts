import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    headingHighlight: {
      highlightHeading: (pos: number, duration?: number) => ReturnType;
    };
  }
}

interface HeadingHighlightStorage {
  highlightFrom: number | null;
  highlightTo: number | null;
  timerId: ReturnType<typeof setTimeout> | null;
}

export const HeadingHighlight = Extension.create<HeadingHighlightStorage>({
  name: "headingHighlight",

  addStorage() {
    return { highlightFrom: null, highlightTo: null, timerId: null };
  },

  addCommands() {
    return {
      highlightHeading:
        (pos, duration = 1500) =>
        ({ editor }) => {
          const storage = (editor.storage as Record<string, any>).headingHighlight as HeadingHighlightStorage;

          // 清除之前的高亮
          if (storage.timerId) {
            clearTimeout(storage.timerId);
          }

          // 找到该位置的标题节点的文字内容范围
          const { doc } = editor.state;
          let textFrom = 0;
          let textTo = 0;
          let found = false;

          doc.descendants((node, nodePos) => {
            if (found) return false;
            if (node.type.name === "heading") {
              // pos 在节点内容范围内
              if (pos >= nodePos && pos <= nodePos + node.nodeSize) {
                // 计算标题文字内容的起始和结束位置（跳过节点标签）
                textFrom = nodePos + 1;
                textTo = nodePos + node.nodeSize - 1;
                found = true;
                return false;
              }
            }
          });

          if (!found) return false;

          // 设置高亮范围
          storage.highlightFrom = textFrom;
          storage.highlightTo = textTo;

          // 触发重新渲染
          editor.view.dispatch(editor.view.state.tr.setMeta("forceUpdate", true));

          // 设置定时器移除高亮
          storage.timerId = setTimeout(() => {
            storage.highlightFrom = null;
            storage.highlightTo = null;
            storage.timerId = null;
            editor.view.dispatch(editor.view.state.tr.setMeta("forceUpdate", true));
          }, duration);

          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    const plugin = new Plugin({
      key: new PluginKey("headingHighlight"),
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, _old, state) => {
          if (tr.getMeta("forceUpdate") || tr.docChanged) {
            const storage = (extension.editor?.storage as Record<string, any>)?.headingHighlight as HeadingHighlightStorage;
            const highlightFrom = storage?.highlightFrom;
            const highlightTo = storage?.highlightTo;

            if (highlightFrom === null || highlightTo === null) {
              return DecorationSet.empty;
            }

            // 使用 inline decoration 只高亮文字内容
            const decoration = Decoration.inline(highlightFrom, highlightTo, {
              class: "heading-highlight-inline",
            });

            return DecorationSet.create(state.doc, [decoration]);
          }
          return _old;
        },
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
      },
    });

    return [plugin];
  },
});
