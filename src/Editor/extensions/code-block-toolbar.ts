import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { NodeView } from "@tiptap/pm/view";
import hljs from "highlight.js/lib/common";

const LANGUAGES = [
  { value: "", label: "Plain Text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "ruby", label: "Ruby" },
  { value: "php", label: "PHP" },
  { value: "swift", label: "Swift" },
  { value: "kotlin", label: "Kotlin" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "less", label: "Less" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "toml", label: "TOML" },
  { value: "xml", label: "XML" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash" },
  { value: "shell", label: "Shell" },
  { value: "powershell", label: "PowerShell" },
  { value: "markdown", label: "Markdown" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "graphql", label: "GraphQL" },
  { value: "plaintext", label: "Plain Text" },
];

export const CodeBlockToolbar = Extension.create({
  name: "codeBlockToolbar",

  addProseMirrorPlugins() {
    const extension = this;

    const plugin = new Plugin({
      key: new PluginKey("codeBlockToolbar"),
      props: {
        nodeViews: {
          codeBlock: (node, view, getPos) => {
            return new CodeBlockToolbarView(node, view, getPos as () => number, extension.editor);
          },
        },
      },
    });

    return [plugin];
  },
});

class CodeBlockToolbarView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: any;
  private getPos: () => number;
  private editor: any;
  private wrapper: HTMLElement;
  private toolbar: HTMLElement;
  private langDropdown: HTMLElement | null = null;

  constructor(node: any, _view: any, getPos: () => number, editor: any) {
    this.node = node;
    this.getPos = getPos;
    this.editor = editor;

    // 主容器
    this.wrapper = document.createElement("div");
    this.wrapper.className = "code-block-toolbar-wrapper";
    this.wrapper.setAttribute("data-language", node.attrs.language || "");

    // 工具栏
    this.toolbar = document.createElement("div");
    this.toolbar.className = "code-block-toolbar";

    // 左侧：语言选择器
    const langSelector = this.createLanguageSelector();
    this.toolbar.appendChild(langSelector);

    // 右侧：操作按钮
    const actions = this.createActions();
    this.toolbar.appendChild(actions);

    // 代码内容区（保留原始 pre > code 结构）
    this.contentDOM = document.createElement("pre");
    this.contentDOM.className = "code-block-content";

    const codeElement = document.createElement("code");
    this.contentDOM.appendChild(codeElement);

    this.wrapper.appendChild(this.toolbar);
    this.wrapper.appendChild(this.contentDOM);

    this.dom = this.wrapper;

    // 点击外部关闭下拉框
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    document.addEventListener("click", this.handleDocumentClick);
  }

  private createLanguageSelector(): HTMLElement {
    const langSelector = document.createElement("div");
    langSelector.className = "code-block-lang-selector";

    const langButton = document.createElement("button");
    langButton.className = "code-block-lang-button";
    langButton.textContent = LANGUAGES.find(l => l.value === this.node.attrs.language)?.label || "Plain Text";

    const langDropdown = document.createElement("div");
    langDropdown.className = "code-block-lang-dropdown";
    langDropdown.style.display = "none";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "code-block-lang-search";
    searchInput.placeholder = "搜索语言...";

    const langList = document.createElement("div");
    langList.className = "code-block-lang-list";

    const renderLangList = (filter: string) => {
      langList.innerHTML = "";
      const filtered = LANGUAGES.filter(l =>
        l.label.toLowerCase().includes(filter.toLowerCase())
      );
      filtered.forEach(lang => {
        const item = document.createElement("div");
        item.className = "code-block-lang-item";
        if (lang.value === this.node.attrs.language) item.classList.add("active");
        item.textContent = lang.label;
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          this.setLanguage(lang.value, lang.label);
          langDropdown.style.display = "none";
        });
        langList.appendChild(item);
      });
    };

    searchInput.addEventListener("input", () => {
      renderLangList(searchInput.value);
    });

    langButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = langDropdown.style.display === "block";
      langDropdown.style.display = isVisible ? "none" : "block";
      if (!isVisible) {
        searchInput.value = "";
        renderLangList("");
        searchInput.focus();
      }
    });

    langDropdown.appendChild(searchInput);
    langDropdown.appendChild(langList);
    langSelector.appendChild(langButton);
    langSelector.appendChild(langDropdown);

    this.langDropdown = langDropdown;
    this.langButton = langButton;

    return langSelector;
  }

  private langButton: HTMLElement | null = null;

  private setLanguage(lang: string, label: string) {
    const pos = this.getPos();
    if (pos !== undefined) {
      this.editor.chain()
        .focus()
        .command(({ tr }: any) => {
          tr.setNodeMarkup(pos, undefined, { language: lang });
          return true;
        })
        .run();
    }
    if (this.langButton) {
      this.langButton.textContent = label;
    }
    this.wrapper.setAttribute("data-language", lang);
    // Re-apply highlighting with new language
    this.node = { ...this.node, attrs: { ...this.node.attrs, language: lang } };
    this.applyHighlighting();
  }

  private createActions(): HTMLElement {
    const actions = document.createElement("div");
    actions.className = "code-block-actions";

    // 切换按钮（展开/折叠）
    const toggleButton = document.createElement("button");
    toggleButton.className = "code-block-action-btn toggle";
    toggleButton.title = "展开/折叠";
    const chevronDown = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
    const chevronRight = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
    toggleButton.innerHTML = chevronDown;
    toggleButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const isCollapsed = this.wrapper.classList.toggle("collapsed");
      toggleButton.innerHTML = isCollapsed ? chevronRight : chevronDown;
    });

    // 删除按钮
    const deleteButton = document.createElement("button");
    deleteButton.className = "code-block-action-btn delete";
    deleteButton.title = "删除";
    deleteButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
    deleteButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const pos = this.getPos();
      if (pos !== undefined) {
        this.editor.chain()
          .focus()
          .command(({ tr, dispatch }: any) => {
            tr.delete(pos, pos + this.node.nodeSize);
            if (dispatch) dispatch(tr);
            return true;
          })
          .run();
      }
    });

    // 复制按钮
    const copyButton = document.createElement("button");
    copyButton.className = "code-block-action-btn copy";
    copyButton.title = "复制";
    copyButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
    copyButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = this.node.textContent;
      navigator.clipboard.writeText(code).then(() => {
        copyButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
        setTimeout(() => {
          copyButton.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
        }, 2000);
      });
    });

    actions.appendChild(toggleButton);
    actions.appendChild(deleteButton);
    actions.appendChild(copyButton);

    return actions;
  }

  private handleDocumentClick(e: MouseEvent) {
    if (this.langDropdown && !this.langDropdown.contains(e.target as Node)) {
      this.langDropdown.style.display = "none";
    }
  }

  update(node: any) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.wrapper.setAttribute("data-language", node.attrs.language || "");
    if (this.langButton) {
      this.langButton.textContent = LANGUAGES.find(l => l.value === node.attrs.language)?.label || "Plain Text";
    }
    return true;
  }

  private applyHighlighting() {
    const code = this.node.textContent;
    const lang = this.node.attrs.language || "";
    const codeEl = this.contentDOM.querySelector("code");
    if (!codeEl) return;

    if (lang && hljs.getLanguage(lang)) {
      try {
        const result = hljs.highlight(code, { language: lang });
        codeEl.innerHTML = result.value;
      } catch {
        codeEl.textContent = code;
      }
    } else {
      codeEl.textContent = code;
    }
  }

  stopEvent(event: Event) {
    if ((event.target as HTMLElement).closest(".code-block-toolbar")) {
      return true;
    }
    return false;
  }

  destroy() {
    document.removeEventListener("click", this.handleDocumentClick);
  }
}
