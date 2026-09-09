// 安全版 CodeBlockLowlight
//
// 修复官方 @tiptap/extension-code-block-lowlight 的语言判断漏洞：
// 官方 lowlight-plugin 用「全局 highlight.js/lib/core 注册表」(registered())
// 判断语言是否可用，但真正执行高亮的是 lowlight 独立实例。
// 当全局注册表含某语言、而 lowlight 实例不含时（例如 gradle、dart、groovy 等
// 仅被完整版 highlight.js 注入全局的语言），官方检查「通过」，
// 但 lowlight.highlight() 直接抛 `Unknown language: \`X\` is not registered`。
//
// 本实现只用 lowlight 实例自身的注册表（listLanguages + registered，主名与别名
// 均可解析）判断语言，未注册一律回退 highlightAuto，并对 highlight 调用做
// try/catch 兜底，保证编辑器永不因高亮抛错。
//
// 额外能力（方案① 本地懒加载）：检测到未注册语言时，用 Vite import.meta.glob
// 按需加载对应的 highlight.js 语言模块（本地 chunk，零网络依赖），注册进
// lowlight 后强制重绘，实现任意语言的「精确语法高亮」，而非 highlightAuto 兜底。

import { findChildren } from "@tiptap/core";
import type { CodeBlockOptions } from "@tiptap/extension-code-block";
import { CodeBlock } from "@tiptap/extension-code-block";
import type { Node as ProsemirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { LanguageFn } from "highlight.js";
// 完整版 highlight.js 已被 Settings.tsx / export/exporters.ts 引入（同一 bundle），
// 这里仅借用其全局注册表构建「别名 → 主语言」映射，不产生新的下载体积。
import hljs from "highlight.js";

// —— 懒加载语言表 ——
// 借助 Vite import.meta.glob，把 highlight.js 全部语言模块变成「按需加载 chunk」，
// 仅在使用到某语言时才动态 import（本地资源，离线可用）。
const languageLoaders = import.meta.glob(
  "/node_modules/highlight.js/lib/languages/*.js",
  { import: "default" }
) as Record<string, () => Promise<LanguageFn>>;

// 主语言名（= 模块文件名）→ 加载器
const loaderByMainName = new Map<string, () => Promise<LanguageFn>>();
for (const [path, loader] of Object.entries(languageLoaders)) {
  const name = path.split("/").pop()?.replace(/\.js$/, "");
  // 过滤非语言模块（index.js 聚合导出、_utils.js 共享工具）
  if (name && !name.startsWith("_") && name !== "index") {
    loaderByMainName.set(name, loader);
  }
}

// 「别名 → 主语言」映射（ps1 → powershell、sh → bash、py → python 等），
// 启动时从完整版全局注册表提取一次，用于解析代码块里书写的别名。
const aliasToMain = new Map<string, string>();
for (const name of hljs.listLanguages()) {
  const aliases = hljs.getLanguage(name)?.aliases;
  if (aliases) {
    for (const alias of aliases) aliasToMain.set(alias, name);
  }
}

// 加载状态缓存：避免对同一语言反复发起加载
const pendingLoads = new Set<string>(); // 正在加载中
const attemptedLoads = new Set<string>(); // 已尝试过（含失败/不存在），不再重试

/** 按需加载并注册语言到 lowlight；成功返回 true，失败/不存在返回 false（幂等） */
async function ensureLanguage(lang: string, lowlight: any): Promise<boolean> {
  if (pendingLoads.has(lang) || attemptedLoads.has(lang)) return false;
  const main = aliasToMain.get(lang) ?? lang;
  const loader = loaderByMainName.get(main);
  if (!loader) {
    attemptedLoads.add(lang);
    return false;
  }
  pendingLoads.add(lang);
  try {
    const fn = await loader();
    if (typeof fn !== "function") return false;
    lowlight.register(main, fn);
    // 一并注册别名（如 ps1 → powershell），保证 language-ps1 也能精确高亮
    for (const alias of hljs.getLanguage(main)?.aliases ?? []) {
      try {
        lowlight.register(alias, fn);
      } catch {
        // 别名冲突（被其他语言占用）时忽略，仍可按主名高亮
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    pendingLoads.delete(lang);
    attemptedLoads.add(lang);
  }
}

// 语言加载完成后的强制重绘标记（PluginKey 保证与其它事务 meta 不冲突）
const HIGHLIGHT_REFRESH = new PluginKey("code-block-lowlight-refresh");

export interface CodeBlockLowlightSafeOptions extends CodeBlockOptions {
  /**
   * The lowlight instance.
   */
  lowlight: any;
}

function parseNodes(
  nodes: any[],
  className: string[] = []
): { text: string; classes: string[] }[] {
  return nodes.flatMap((node) => {
    // Element nodes: children inherit *this* element's classes only (not grandparents).
    // TipTap decorations are flat spans — only keep the innermost token class
    // so `#include` does not become `hljs-meta hljs-keyword` (cascade fights).
    if (node.children) {
      const ownClasses = node.properties?.className ?? [];
      return parseNodes(node.children, ownClasses);
    }

    return {
      text: node.value,
      classes: className,
    };
  });
}

function getHighlightNodes(result: any) {
  // `.value` for lowlight v1, `.children` for lowlight v2+
  return result.value || result.children || [];
}

function getDecorations({
  doc,
  name,
  lowlight,
  defaultLanguage,
  onRequestLoad,
}: {
  doc: ProsemirrorNode;
  name: string;
  lowlight: any;
  defaultLanguage: string | null | undefined;
  onRequestLoad?: (language: string) => void;
}) {
  const decorations: Decoration[] = [];

  findChildren(doc, (node) => node.type.name === name).forEach((block) => {
    let from = block.pos + 1;
    const language = block.node.attrs.language || defaultLanguage;

    // 关键修复：只信任 lowlight 实例自身的注册表（主名 + 别名），
    // 绝不依赖全局 highlight.js 注册表，杜绝「检查通过、实际抛错」。
    const canHighlight = Boolean(
      language &&
        (lowlight.listLanguages().includes(language) ||
          (typeof lowlight.registered === "function" &&
            lowlight.registered(language)))
    );

    // 未注册语言 → 触发本地按需加载（幂等）；加载成功后由扩展层 dispatch
    // HIGHLIGHT_REFRESH 强制重绘，使本块转为精确语法高亮。
    if (!canHighlight && language && onRequestLoad) {
      onRequestLoad(language);
    }

    let result: any;
    try {
      result = canHighlight
        ? lowlight.highlight(language, block.node.textContent)
        : lowlight.highlightAuto(block.node.textContent);
    } catch {
      // 意外错误（如 grammar 内部异常）一律回退自动检测
      result = lowlight.highlightAuto(block.node.textContent);
    }

    parseNodes(getHighlightNodes(result)).forEach((node) => {
      const to = from + node.text.length;

      if (node.classes.length) {
        const decoration = Decoration.inline(from, to, {
          class: node.classes.join(" "),
        });

        decorations.push(decoration);
      }

      from = to;
    });
  });

  return DecorationSet.create(doc, decorations);
}

// oxlint-disable-next-line unsafe-function-type
function isFunction(param: any): param is Function {
  return typeof param === "function";
}

export function LowlightPlugin({
  name,
  lowlight,
  defaultLanguage,
  onRequestLoad,
}: {
  name: string;
  lowlight: any;
  defaultLanguage: string | null | undefined;
  onRequestLoad?: (language: string) => void;
}) {
  if (
    !["highlight", "highlightAuto", "listLanguages"].every((api) =>
      isFunction(lowlight[api])
    )
  ) {
    throw Error(
      "You should provide an instance of lowlight to use the code-block-lowlight-safe extension"
    );
  }

  const lowlightPlugin: Plugin<any> = new Plugin({
    key: new PluginKey("lowlight"),

    state: {
      init: (_, { doc }) =>
        getDecorations({
          doc,
          name,
          lowlight,
          defaultLanguage,
          onRequestLoad,
        }),
      apply: (transaction, decorationSet, oldState, newState) => {
        // 语言模块加载完成后的强制重绘：doc 未变，但需重算 decorations
        if (transaction.getMeta(HIGHLIGHT_REFRESH)) {
          return getDecorations({
            doc: transaction.doc,
            name,
            lowlight,
            defaultLanguage,
            onRequestLoad,
          });
        }

        const oldNodeName = oldState.selection.$head.parent.type.name;
        const newNodeName = newState.selection.$head.parent.type.name;
        const oldNodes = findChildren(oldState.doc, (node) => node.type.name === name);
        const newNodes = findChildren(newState.doc, (node) => node.type.name === name);

        if (
          transaction.docChanged &&
          // Apply decorations if:
          // selection includes named node,
          ([oldNodeName, newNodeName].includes(name) ||
            // OR transaction adds/removes named node,
            newNodes.length !== oldNodes.length ||
            // OR transaction has changes that completely encapsulate a node
            // (for example, a transaction that affects the entire document).
            // Such transactions can happen during collab syncing via y-prosemirror, for example.
            transaction.steps.some((step) => {
              // @ts-ignore
              return (
                // @ts-ignore
                step.from !== undefined &&
                // @ts-ignore
                step.to !== undefined &&
                oldNodes.some((node) => {
                  // @ts-ignore
                  return (
                    // @ts-ignore
                    node.pos >= step.from &&
                    // @ts-ignore
                    node.pos + node.node.nodeSize <= step.to
                  );
                })
              );
            }))
        ) {
          return getDecorations({
            doc: transaction.doc,
            name,
            lowlight,
            defaultLanguage,
            onRequestLoad,
          });
        }

        return decorationSet.map(transaction.mapping, transaction.doc);
      },
    },

    props: {
      decorations(state) {
        return lowlightPlugin.getState(state);
      },
    },
  });

  return lowlightPlugin;
}

export const CodeBlockLowlightSafe = CodeBlock.extend<CodeBlockLowlightSafeOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      lowlight: {},
      languageClassPrefix: "language-",
      exitOnTripleEnter: true,
      exitOnArrowDown: true,
      exitOnArrowUp: true,
      defaultLanguage: null,
      enableTabIndentation: false,
      tabSize: 4,
      HTMLAttributes: {},
    };
  },

  addProseMirrorPlugins() {
    const editor = this.editor;
    // 语言加载完成 → dispatch 空事务 + 自定义 meta，触发插件重算 decorations
    const refreshAfterLoad = () => {
      try {
        if (!editor || editor.isDestroyed) return;
        editor.view.dispatch(editor.state.tr.setMeta(HIGHLIGHT_REFRESH, true));
      } catch {
        // 视图未就绪/已销毁时忽略；下次 doc 变化时同样会走精确高亮
      }
    };
    return [
      ...(this.parent?.() || []),
      LowlightPlugin({
        name: this.name,
        lowlight: this.options.lowlight,
        defaultLanguage: this.options.defaultLanguage,
        onRequestLoad: (language) => {
          void ensureLanguage(language, this.options.lowlight).then((loaded) => {
            if (loaded) refreshAfterLoad();
          });
        },
      }),
    ];
  },
});

export default CodeBlockLowlightSafe;
