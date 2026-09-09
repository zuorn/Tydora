import { Extension } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";
import { CODE_THEMES, type CodeTheme, type CustomCodeTheme } from "../../themes/codeThemes";

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
  { value: "mermaid", label: "Mermaid" },
  { value: "dockerfile", label: "Dockerfile" },
  { value: "graphql", label: "GraphQL" },
  { value: "plaintext", label: "Plain Text" },
];

const COPY_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
const CHECK_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
const DELETE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
const THEME_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>`;

/** 获取当前可选的代码主题列表（内置 + 自定义），供主题下拉使用 */
function getAvailableCodeThemes(): Array<{ id: string; name: string; isDark: boolean }> {
  const builtin = CODE_THEMES.map((t: CodeTheme) => ({
    id: t.id,
    name: t.name,
    isDark: t.isDark,
  }));
  const custom = ((window as unknown as { __tydoraCustomCodeThemes?: CustomCodeTheme[] }).__tydoraCustomCodeThemes || []).map(
    (m) => ({ id: m.id, name: m.name, isDark: m.isDark }),
  );
  return [...builtin, ...custom];
}

/** 获取当前全局代码主题 id（由 ThemeContext 写入 documentElement.dataset.codeTheme） */
function getCurrentCodeTheme(): string {
  return document.documentElement.dataset.codeTheme || "github-light";
}

function langLabel(lang: string | null | undefined): string {
  return LANGUAGES.find((l) => l.value === (lang || ""))?.label || "Plain Text";
}

/**
 * 代码块语言选择工具栏。
 *
 * 事件全部绑在 NodeView 实例上（不用 document 全局 capture），
 * 避免与「点击外部关闭」在同一 mousedown 里互相打架。
 * 高亮交给 CodeBlockLowlight 的 decorations，不在这里改 contentDOM。
 *
 * 样式由 document.documentElement[data-code-block-toolbar] 控制：
 * - minimal（默认）：右上角浮动语言选择
 * - classic：顶栏 + 复制/删除按钮
 */
export const CodeBlockToolbar = Extension.create({
  name: "codeBlockToolbar",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("codeBlockToolbar"),
        props: {
          nodeViews: {
            codeBlock: (node, view, getPos) =>
              new CodeBlockToolbarView(node, view, getPos as () => number | undefined),
          },
        },
      }),
    ];
  },
});

class CodeBlockToolbarView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  private node: ProseMirrorNode;
  private view: EditorView;
  private getPos: () => number | undefined;

  private wrapper: HTMLElement;
  private toolbar: HTMLElement;
  private langButton: HTMLButtonElement;
  private themeButton!: HTMLButtonElement;
  private copyButton!: HTMLButtonElement;
  private deleteButton!: HTMLButtonElement;

  private portal: HTMLDivElement | null = null;
  private portalType: "lang" | "theme" | null = null;
  private onDocPointerDown: ((e: PointerEvent) => void) | null = null;
  private openTimer: ReturnType<typeof setTimeout> | null = null;
  private copyResetTimer: ReturnType<typeof setTimeout> | null = null;
  private onCodeThemeChanged: (() => void) | null = null;

  constructor(
    node: ProseMirrorNode,
    view: EditorView,
    getPos: () => number | undefined,
  ) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.wrapper = document.createElement("div");
    this.wrapper.className = "code-block-toolbar-wrapper";
    this.wrapper.dataset.language = node.attrs.language || "";

    this.toolbar = document.createElement("div");
    this.toolbar.className = "code-block-toolbar";
    this.toolbar.contentEditable = "false";

    const langSelector = document.createElement("div");
    langSelector.className = "code-block-lang-selector";

    this.langButton = document.createElement("button");
    this.langButton.type = "button";
    this.langButton.className = "code-block-lang-button";
    this.langButton.textContent = langLabel(node.attrs.language);
    // 用 pointerdown：比 click 更早，且在 ProseMirror 处理选区之前拦住
    this.langButton.addEventListener("pointerdown", this.onLangButtonPointerDown);
    langSelector.appendChild(this.langButton);
    this.toolbar.appendChild(langSelector);

    // classic 样式下显示的复制/删除；minimal 下由 CSS 隐藏
    this.toolbar.appendChild(this.createActions());

    // TipTap CodeBlock 约定：pre > code，contentDOM 必须是 code
    const pre = document.createElement("pre");
    pre.className = "code-block-content";
    const code = document.createElement("code");
    pre.appendChild(code);
    this.contentDOM = code;

    this.wrapper.appendChild(this.toolbar);
    this.wrapper.appendChild(pre);
    this.dom = this.wrapper;

    // 全局代码主题变化时更新主题按钮的高亮态（暗色主题时高亮）
    this.onCodeThemeChanged = () => {
      const isDark = document.documentElement.dataset.codeThemeDark === "true";
      this.themeButton.classList.toggle("active", isDark);
    };
    window.addEventListener("code-theme-changed", this.onCodeThemeChanged);
    this.onCodeThemeChanged();
  }

  private createActions(): HTMLElement {
    const actions = document.createElement("div");
    actions.className = "code-block-actions";

    this.themeButton = document.createElement("button");
    this.themeButton.type = "button";
    this.themeButton.className = "code-block-action-btn theme";
    this.themeButton.title = "切换主题";
    this.themeButton.innerHTML = THEME_ICON;
    this.themeButton.addEventListener("pointerdown", this.onThemePointerDown);

    this.deleteButton = document.createElement("button");
    this.deleteButton.type = "button";
    this.deleteButton.className = "code-block-action-btn delete";
    this.deleteButton.title = "删除";
    this.deleteButton.innerHTML = DELETE_ICON;
    this.deleteButton.addEventListener("pointerdown", this.onDeletePointerDown);

    this.copyButton = document.createElement("button");
    this.copyButton.type = "button";
    this.copyButton.className = "code-block-action-btn copy";
    this.copyButton.title = "复制";
    this.copyButton.innerHTML = COPY_ICON;
    this.copyButton.addEventListener("pointerdown", this.onCopyPointerDown);

    actions.appendChild(this.themeButton);
    actions.appendChild(this.deleteButton);
    actions.appendChild(this.copyButton);
    return actions;
  }

  private onLangButtonPointerDown = (e: PointerEvent) => {
    // 只响应主按键
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (this.portal) {
      // 已打开主题下拉 → 切到语言；已打开语言 → 关闭
      if (this.portalType === "theme") {
        this.closeDropdown();
        this.openDropdown("lang");
      } else {
        this.closeDropdown();
      }
      return;
    }
    this.openDropdown("lang");
  };

  private onThemePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (this.portal) {
      if (this.portalType === "lang") {
        this.closeDropdown();
        this.openDropdown("theme");
      } else {
        this.closeDropdown();
      }
      return;
    }
    this.openDropdown("theme");
  };

  private onDeletePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.deleteCodeBlock();
  };

  private onCopyPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.copyCodeBlock();
  };

  private openDropdown(type: "lang" | "theme") {
    this.closeDropdown();

    const anchorButton = type === "lang" ? this.langButton : this.themeButton;
    const anchor = anchorButton.getBoundingClientRect();

    const portal = document.createElement("div");
    portal.className = type === "lang" ? "code-block-lang-dropdown-portal" : "code-block-theme-dropdown-portal";
    portal.style.display = "flex";
    portal.style.position = "fixed";
    portal.style.top = `${anchor.bottom + 4}px`;
    // 语言下拉左对齐按钮左边；主题下拉右对齐按钮右边（按钮在代码块右侧，避免溢出）
    if (type === "lang") {
      portal.style.left = `${anchor.left}px`;
    } else {
      portal.style.right = `${Math.max(8, window.innerWidth - anchor.right)}px`;
    }
    portal.style.zIndex = "10000";

    const list = document.createElement("div");
    list.className = "code-block-lang-list";

    if (type === "lang") {
      const currentLang = this.node.attrs.language || "";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "code-block-lang-search";
      input.placeholder = "搜索语言...";
      input.addEventListener("pointerdown", (e) => e.stopPropagation());

      const renderList = (filter: string) => {
        list.replaceChildren();
        const q = filter.trim().toLowerCase();
        for (const lang of LANGUAGES) {
          if (q && !lang.label.toLowerCase().includes(q) && !lang.value.toLowerCase().includes(q)) {
            continue;
          }
          const item = document.createElement("div");
          item.className = "code-block-lang-item";
          if (lang.value === currentLang) item.classList.add("active");
          item.textContent = lang.label;
          item.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            this.applyLanguage(lang.value);
            this.closeDropdown();
          });
          list.appendChild(item);
        }
      };
      renderList("");
      input.addEventListener("input", () => renderList(input.value));
      portal.appendChild(input);
      setTimeout(() => input.focus(), 0);
    } else {
      // 主题列表：与设置页「代码主题」一致（内置 + 自定义），带色块 + 名称
      const currentTheme = getCurrentCodeTheme();
      const themes = getAvailableCodeThemes();
      for (const theme of themes) {
        const item = document.createElement("div");
        item.className = "code-block-lang-item code-block-theme-item";
        if (theme.id === currentTheme) item.classList.add("active");

        const swatch = document.createElement("span");
        swatch.className = "code-block-theme-swatch";
        swatch.style.background = theme.isDark ? "#1e1e2e" : "#f6f8fa";
        item.appendChild(swatch);

        const label = document.createElement("span");
        label.className = "code-block-theme-label";
        label.textContent = theme.name;
        item.appendChild(label);

        item.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          // 通过全局事件通知 ThemeContext 切换代码主题
          window.dispatchEvent(
            new CustomEvent("request-code-theme-change", { detail: { themeId: theme.id } }),
          );
          this.closeDropdown();
        });
        list.appendChild(item);
      }
    }

    portal.appendChild(list);
    document.body.appendChild(portal);
    this.portal = portal;
    this.portalType = type;
    this.wrapper.classList.add("toolbar-active");

    // 视口边界修正
    requestAnimationFrame(() => {
      if (!this.portal) return;
      const r = this.portal.getBoundingClientRect();
      // 底部超出视口 → 翻到按钮上方
      if (r.bottom > window.innerHeight) {
        this.portal.style.top = `${anchor.top - r.height - 4}px`;
      }
      if (type === "lang") {
        // 语言下拉：右边溢出 → 贴右视口边
        if (r.right > window.innerWidth) {
          this.portal.style.left = `${Math.max(8, window.innerWidth - r.width - 8)}px`;
        }
      } else {
        // 主题下拉：左边溢出 → 贴左视口边
        if (r.left < 0) {
          this.portal.style.right = `${Math.max(8, window.innerWidth - r.width - 8)}px`;
        }
      }
    });

    // 延后注册外部关闭：避免打开当下的 pointerdown 立刻关掉菜单
    this.openTimer = setTimeout(() => {
      this.openTimer = null;
      this.onDocPointerDown = (e: PointerEvent) => {
        const t = e.target as Node | null;
        if (!t) return;
        if (this.portal?.contains(t)) return;
        if (this.langButton.contains(t) || this.themeButton.contains(t)) return;
        this.closeDropdown();
      };
      document.addEventListener("pointerdown", this.onDocPointerDown, true);
    }, 0);
  }

  private closeDropdown() {
    if (this.openTimer !== null) {
      clearTimeout(this.openTimer);
      this.openTimer = null;
    }
    if (this.onDocPointerDown) {
      document.removeEventListener("pointerdown", this.onDocPointerDown, true);
      this.onDocPointerDown = null;
    }
    if (this.portal) {
      this.portal.remove();
      this.portal = null;
    }
    this.portalType = null;
    this.wrapper.classList.remove("toolbar-active");
  }

  private applyLanguage(lang: string) {
    const pos = this.getPos();
    if (pos === undefined) return;

    const nodeAtPos = this.view.state.doc.nodeAt(pos);
    if (!nodeAtPos || nodeAtPos.type.name !== "codeBlock") return;

    // Mermaid：整块替换为 mermaid 节点
    if (lang === "mermaid") {
      const mermaidType = this.view.state.schema.nodes.mermaid;
      if (mermaidType) {
        const content = nodeAtPos.textContent
          ? [this.view.state.schema.text(nodeAtPos.textContent)]
          : [];
        const mermaidNode = mermaidType.create(null, content);
        this.view.dispatch(
          this.view.state.tr.replaceWith(pos, pos + nodeAtPos.nodeSize, mermaidNode),
        );
        return;
      }
    }

    // 只改 attrs；语法高亮由 lowlight decorations 根据 language 重算
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(pos, undefined, {
        ...nodeAtPos.attrs,
        language: lang || null,
      }),
    );
  }

  private deleteCodeBlock() {
    const pos = this.getPos();
    if (pos === undefined) return;
    const nodeAtPos = this.view.state.doc.nodeAt(pos);
    if (!nodeAtPos || nodeAtPos.type.name !== "codeBlock") return;
    this.view.dispatch(this.view.state.tr.delete(pos, pos + nodeAtPos.nodeSize));
  }

  private copyCodeBlock() {
    const pos = this.getPos();
    if (pos === undefined) return;
    const nodeAtPos = this.view.state.doc.nodeAt(pos);
    if (!nodeAtPos || nodeAtPos.type.name !== "codeBlock") return;

    void navigator.clipboard.writeText(nodeAtPos.textContent).then(() => {
      this.copyButton.innerHTML = CHECK_ICON;
      if (this.copyResetTimer !== null) clearTimeout(this.copyResetTimer);
      this.copyResetTimer = setTimeout(() => {
        this.copyResetTimer = null;
        this.copyButton.innerHTML = COPY_ICON;
      }, 2000);
    });
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.wrapper.dataset.language = node.attrs.language || "";
    this.langButton.textContent = langLabel(node.attrs.language);
    return true;
  }

  stopEvent(event: Event) {
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    // 工具栏内事件全部交给我们处理，不让 ProseMirror 改选区/抢焦点
    if (this.toolbar.contains(target)) return true;
    if (this.portal?.contains(target)) return true;
    return false;
  }

  ignoreMutation(mutation: MutationRecord | { type: string; target: Node }) {
    // 工具栏 / portal 的 DOM 变动与文档内容无关
    const target = mutation.target as Node;
    if (this.toolbar.contains(target) || target === this.toolbar) return true;
    if (this.portal?.contains(target)) return true;
    // dataset / class 写在 wrapper 上
    if (target === this.wrapper && mutation.type === "attributes") return true;
    return false;
  }

  destroy() {
    this.closeDropdown();
    if (this.copyResetTimer !== null) clearTimeout(this.copyResetTimer);
    if (this.onCodeThemeChanged) {
      window.removeEventListener("code-theme-changed", this.onCodeThemeChanged);
      this.onCodeThemeChanged = null;
    }
    this.langButton.removeEventListener("pointerdown", this.onLangButtonPointerDown);
    this.themeButton.removeEventListener("pointerdown", this.onThemePointerDown);
    this.deleteButton.removeEventListener("pointerdown", this.onDeletePointerDown);
    this.copyButton.removeEventListener("pointerdown", this.onCopyPointerDown);
  }
}
