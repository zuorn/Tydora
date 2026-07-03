import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

export const TableFloatingToolbar = Extension.create({
  name: "tableFloatingToolbar",

  addProseMirrorPlugins() {
    const plugin = new Plugin({
      key: new PluginKey("tableFloatingToolbar"),

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
    });

    return [plugin];
  },
});
