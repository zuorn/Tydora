import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    searchHighlight: {
      setSearchHighlight: (query: string) => ReturnType;
      clearSearchHighlight: () => ReturnType;
    };
  }
}

interface SearchHighlightStorage {
  query: string;
}

export const SearchHighlight = Extension.create<SearchHighlightStorage>({
  name: "searchHighlight",

  addStorage() {
    return { query: "" };
  },

  addCommands() {
    return {
      setSearchHighlight: (query) => ({ editor }) => {
        (editor.storage as Record<string, any>).searchHighlight = { query };
        // 触发重新渲染
        editor.view.dispatch(editor.view.state.tr.setMeta("forceUpdate", true));
        return true;
      },
      clearSearchHighlight: () => ({ editor }) => {
        (editor.storage as Record<string, any>).searchHighlight = { query: "" };
        editor.view.dispatch(editor.view.state.tr.setMeta("forceUpdate", true));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    const plugin = new Plugin({
      key: new PluginKey("searchHighlight"),
      state: {
        init: () => DecorationSet.empty,
        apply: (tr, _old, state) => {
          // 检查是否是 forceUpdate
          if (tr.getMeta("forceUpdate") || tr.docChanged) {
            const query = (extension.editor?.storage as Record<string, any>)?.searchHighlight?.query;
            if (!query) return DecorationSet.empty;

            const decorations: Decoration[] = [];
            const doc = state.doc;

            doc.descendants((node, pos) => {
              if (!node.isText) return;

              const text = node.text || "";
              const lowerText = text.toLowerCase();
              const lowerQuery = query.toLowerCase();

              let index = 0;
              while (index < text.length) {
                const found = lowerText.indexOf(lowerQuery, index);
                if (found === -1) break;

                decorations.push(
                  Decoration.inline(pos + found, pos + found + query.length, {
                    class: "search-highlight",
                  })
                );

                index = found + 1;
              }
            });

            return DecorationSet.create(doc, decorations);
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
