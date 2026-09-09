// src/vim/index.ts
// Vim 模块唯一对外入口。仅导出 4 个符号，内部实现细节不外泄。
//
// 用法（App.tsx）：
//   import { VimProvider, useVim } from "./vim";
//   <VimProvider><App/></VimProvider>
//
// 设计文档：docs/vim-mode-design.md

export { VimProvider, useVim } from "./VimProvider";
export { createVimExtension } from "./codemirror/vimExtension";
export type { VimAdapterOptions } from "./codemirror/vimExtension";
export { createTiptapVimExtensions, syncVimMode, mapVimMode, exitTiptapVisualMode, enterTiptapInsertMode } from "./tiptap/tiptapVimExtension";
export { FileTreeVim } from "./filetree/FileTreeVim";

// Leader 菜单（编辑器集成用）
export { useLeader } from "./leader/useLeader";
export type { UseLeaderOptions, UseLeaderReturn } from "./leader/useLeader";
export { LeaderMenu } from "./leader/LeaderMenu";
export { executeCodeMirrorAction } from "./codemirror/markdownActions";

// 前缀键配置（g/z/m/t）
export { prefixGConfig } from "./config/prefixG";
export { prefixZConfig } from "./config/prefixZ";
export { prefixMConfig } from "./config/prefixM";
export { prefixTConfig } from "./config/prefixT";

// 冲突快捷键清单（设置面板 + App.tsx 让渡判断共用）
export { CONFLICT_KEYS } from "./config/conflictKeys";
export type { ConflictKeyDef } from "./config/conflictKeys";

// 窗口导航（Ctrl+w h/j/k/l）
export { useWindowNavigation } from "./navigation/useWindowNavigation";

// 配置加载（设置面板与 App 初始化用）
export { loadVimConfig, saveVimConfig, VIM_CONFIG_KEY, DEFAULT_VIM_CONFIG } from "./config/configLoader";
export type { VimConfig, VimMode, VimState } from "./types";
