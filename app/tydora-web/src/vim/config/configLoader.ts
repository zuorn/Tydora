// src/vim/config/configLoader.ts
// Vim 配置加载与持久化。独立 localStorage 键，绝不读写 zmd-shortcuts。

import type { VimConfig } from "../types";
export type { VimConfig };
import { buildDefaultConflictKeys } from "./conflictKeys";

/** Vim 配置的 localStorage 键（独立于 zmd-shortcuts） */
export const VIM_CONFIG_KEY = "zmd-vim-config";

/** 默认配置：默认关闭，零侵入；冲突键全部让渡给 Vim（与改动前行为一致） */
export const DEFAULT_VIM_CONFIG: VimConfig = {
  enabled: false,
  leaderKey: " ",
  menuTimeout: 3000,
  conflictKeys: buildDefaultConflictKeys(),
  __v: 2,
};

/** 从 localStorage 加载 Vim 配置，合并默认值（含 conflictKeys 逐键合并，新增的冲突键自动补默认值） */
export function loadVimConfig(): VimConfig {
  try {
    const saved = localStorage.getItem(VIM_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<VimConfig>;
      // 合并 conflictKeys：以默认值为基底，覆盖用户已保存的值
      const mergedConflictKeys = { ...buildDefaultConflictKeys(), ...(parsed.conflictKeys ?? {}) };

      // ── 迁移 v1 → v2：ctrl+p 默认从 true(vim 接管) 改为 false(App 命令面板生效) ──
      // 旧配置中 ctrl+p 是默认值 true（非用户主动设置），删除让它回退到新默认值 false。
      // 判断依据：v1 时期 buildDefaultConflictKeys() 总是写入 ctrl+p=true，
      // 所以只要旧 saved 里有该键且 __v < 2，就视为旧默认值并清除。
      const savedVersion = parsed.__v ?? 1;
      if (savedVersion < 2 && mergedConflictKeys["ctrl+p"] === true) {
        delete mergedConflictKeys["ctrl+p"];
      }

      return { ...DEFAULT_VIM_CONFIG, ...parsed, conflictKeys: mergedConflictKeys, __v: 2 };
    }
  } catch {
    // 损坏的配置回退默认值
  }
  return { ...DEFAULT_VIM_CONFIG };
}

/** 保存 Vim 配置到 localStorage */
export function saveVimConfig(config: VimConfig): void {
  try {
    localStorage.setItem(VIM_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // 忽略写入失败（隐私模式等）
  }
}
