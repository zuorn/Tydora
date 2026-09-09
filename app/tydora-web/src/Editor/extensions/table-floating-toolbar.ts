import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const TableFloatingToolbar = Extension.create({
  name: "tableFloatingToolbar",

  addProseMirrorPlugins() {
    const plugin = new Plugin({
      key: new PluginKey("tableFloatingToolbar"),

      state: {
        init: () => ({ inTable: false }),
        apply: (tr, prev) => {
          if (!tr.docChanged && !tr.selectionSet) return prev;
          const { $from } = tr.selection;
          let inTable = false;
          for (let depth = $from.depth; depth >= 0; depth--) {
            if ($from.node(depth).type.name === "table") {
              inTable = true;
              break;
            }
          }
          return { inTable };
        },
      },

      props: {
        handleDOMEvents: {
          click: (_view, event) => {
            const target = event.target as HTMLElement;
            const table = target.closest("table");
            if (table) {
              const customEvent = new CustomEvent("table-toolbar-show", {
                detail: { table },
                bubbles: true,
              });
              target.dispatchEvent(customEvent);
            }
            return false;
          },
        },
      },

      view: () => ({
        update: (view) => {
          const pluginState = plugin.getState(view.state);
          if (pluginState && !pluginState.inTable) {
            window.dispatchEvent(new CustomEvent("table-toolbar-hide"));
          }
        },
      }),
    });

    return [plugin];
  },
});
