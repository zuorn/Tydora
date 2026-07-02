import { Node, mergeAttributes, InputRule } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiLink: {
      setWikiLink: (options: { note: string; heading?: string; display?: string }) => ReturnType;
    };
  }
}

export const WikiLink = Node.create({
  name: "wikiLink",

  inline: true,
  group: "inline",
  draggable: true,

  addAttributes() {
    return {
      note: { default: null },
      heading: { default: null },
      display: { default: null },
    };
  },

  parseHTML() {
    return [
      { tag: 'a[data-note]' },
      { tag: 'span[data-note]' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes, {
      class: "wiki-link",
      "data-note": HTMLAttributes.note,
      "data-heading": HTMLAttributes.heading,
      href: "#",
    }), HTMLAttributes.display || HTMLAttributes.note];
  },

  addCommands() {
    return {
      setWikiLink: (options) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        });
      },
    };
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]]*)$/,
        handler: ({ range, match }) => {
          const query = match[1];
          window.dispatchEvent(new CustomEvent("wiki-link-trigger", {
            detail: { query, position: range.from }
          }));
        },
      }),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("a");
      dom.className = "wiki-link";
      dom.dataset.note = node.attrs.note as string;
      dom.dataset.heading = node.attrs.heading as string;
      dom.textContent = (node.attrs.display as string) || (node.attrs.note as string);
      dom.href = "#";

      dom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("wiki-link-click", {
          detail: {
            noteName: node.attrs.note,
            heading: node.attrs.heading
          }
        }));
      });

      return { dom };
    };
  },
});
