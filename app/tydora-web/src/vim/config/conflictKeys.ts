// src/vim/config/conflictKeys.ts
// Vim 模式与全局快捷键冲突清单。
//
// 每个条目定义：
//   id     — 稳定标识符（"ctrl+x"），用于 VimConfig.conflictKeys 的键
//   label  — 显示名（App 快捷键的功能名）
//   keys   — 快捷键显示文本（如 "Ctrl+D"）
//   vimAction — Vim 中该键的含义（帮助用户理解冲突）
//   defaultYield — 默认是否让渡给 Vim（true=Vim 接管，false=App 快捷键生效）
//
// 默认全部 true（与改动前行为一致：Vim 开启 + 非 insert + 焦点在编辑器时由 Vim 接管）。

export interface ConflictKeyDef {
  id: string;
  label: string;
  keys: string;
  vimAction: string;
  defaultYield: boolean;
}

export const CONFLICT_KEYS: ConflictKeyDef[] = [
  { id: "ctrl+d", label: "删除线",       keys: "Ctrl+D", vimAction: "向下翻半页",       defaultYield: true },
  { id: "ctrl+u", label: "代码块",       keys: "Ctrl+U", vimAction: "向上翻半页",       defaultYield: true },
  { id: "ctrl+e", label: "行内代码",     keys: "Ctrl+E", vimAction: "向下滚动一行",     defaultYield: true },
  { id: "ctrl+h", label: "替换",         keys: "Ctrl+H", vimAction: "光标左移 / 退格",  defaultYield: true },
  { id: "ctrl+f", label: "查找",         keys: "Ctrl+F", vimAction: "向下翻整页",       defaultYield: true },
  { id: "ctrl+w", label: "关闭窗格",     keys: "Ctrl+W", vimAction: "窗口操作前缀",     defaultYield: true },
  { id: "ctrl+o", label: "快速打开",     keys: "Ctrl+O", vimAction: "跳转列表后退",     defaultYield: true },
  { id: "ctrl+p", label: "命令面板",     keys: "Ctrl+P", vimAction: "向上移动一行",     defaultYield: false },
  { id: "ctrl+g", label: "知识图谱",     keys: "Ctrl+G", vimAction: "显示文件信息",     defaultYield: true },
];

/** 构建默认 conflictKeys 记录：所有冲突键 → defaultYield */
export function buildDefaultConflictKeys(): Record<string, boolean> {
  const r: Record<string, boolean> = {};
  for (const k of CONFLICT_KEYS) r[k.id] = k.defaultYield;
  return r;
}
