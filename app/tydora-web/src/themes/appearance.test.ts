/**
 * loadAppearanceState 的主题迁移单元测试。
 *
 * 内置主题被删除后，老用户存的还是旧 id；不迁移就会撞上 ThemeContext 里
 * "认不出来的 id 一律回落到 white" 的兜底，暗色用户会突然跳到亮色。
 * 这里验证 RETIRED_APP_THEMES 在两条读取路径（现有明暗对 / legacy 单键）上
 * 都生效，且不会误伤自定义主题和未知 id（node --experimental-strip-types 直接运行本文件）。
 */
import {
  APPEARANCE_MODE_KEY,
  LEGACY_THEME_KEY,
  PREFERRED_APP_THEME_KEY,
  RETIRED_APP_THEMES,
  loadAppearanceState,
} from "./appearance.ts";

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual === expected) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}: 期望 ${String(expected)}，实际 ${String(actual)}`);
  }
}

/** 造一个最小 localStorage，并记下所有回写 */
function stubStorage(initial: Record<string, string>) {
  const data: Record<string, string> = { ...initial };
  const written: Array<[string, string]> = [];
  const store = {
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
      written.push([key, value]);
    },
    removeItem: (key: string) => {
      delete data[key];
    },
  };
  (globalThis as { localStorage: unknown }).localStorage = store;
  return { data, written };
}

function readBackAppPair(data: Record<string, string>) {
  return JSON.parse(data[PREFERRED_APP_THEME_KEY]) as { light: string; dark: string };
}

console.log("── 现有明暗对（pair 分支） ──");

const t0 = stubStorage({
  [APPEARANCE_MODE_KEY]: "dark",
  [PREFERRED_APP_THEME_KEY]: JSON.stringify({ light: "white", dark: "mint-dark" }),
});
let state = loadAppearanceState();
assertEqual(state.preferredAppTheme.dark, "tokyo-night", "暗色槽 mint-dark → tokyo-night");
assertEqual(state.preferredAppTheme.light, "white", "亮色槽不受影响");
assertEqual(readBackAppPair(t0.data).dark, "tokyo-night", "回写到 storage 的也是新主题");

console.log("── 自定义主题与未知 id 不被误伤 ──");

stubStorage({
  [APPEARANCE_MODE_KEY]: "dark",
  [PREFERRED_APP_THEME_KEY]: JSON.stringify({ light: "white", dark: "custom-abc123" }),
});
state = loadAppearanceState();
assertEqual(state.preferredAppTheme.dark, "custom-abc123", "custom-* 原样保留");

stubStorage({
  [APPEARANCE_MODE_KEY]: "dark",
  [PREFERRED_APP_THEME_KEY]: JSON.stringify({ light: "white", dark: "some-future-theme" }),
});
state = loadAppearanceState();
assertEqual(state.preferredAppTheme.dark, "some-future-theme", "未知 id 不改写");

console.log("── legacy 单键分支 ──");

stubStorage({ [LEGACY_THEME_KEY]: "mint-dark" });
state = loadAppearanceState();
assertEqual(state.preferredAppTheme.dark, "tokyo-night", "旧键 mint-dark → 暗色槽 tokyo-night");
assertEqual(state.appearanceMode, "dark", "旧键 mint-dark 仍判定为暗色模式");

stubStorage({ [LEGACY_THEME_KEY]: "slate" });
state = loadAppearanceState();
assertEqual(state.preferredAppTheme.light, "slate", "旧键亮色主题放亮色槽");
assertEqual(state.appearanceMode, "light", "旧键亮色主题判定为亮色模式");

console.log("── 迁移只在真的改写时回写一次 ──");

const t1 = stubStorage({
  [APPEARANCE_MODE_KEY]: "dark",
  [PREFERRED_APP_THEME_KEY]: JSON.stringify({ light: "white", dark: "mint-dark" }),
});
loadAppearanceState();
assertEqual(
  t1.written.filter(([k, v]) => k === PREFERRED_APP_THEME_KEY && v.includes("tokyo-night")).length,
  1,
  "命中迁移 → 回写 app theme 一次",
);

const t2 = stubStorage({
  [APPEARANCE_MODE_KEY]: "dark",
  [PREFERRED_APP_THEME_KEY]: JSON.stringify({ light: "white", dark: "tokyo-night" }),
});
loadAppearanceState();
assertEqual(
  t2.written.some(([k]) => k === PREFERRED_APP_THEME_KEY),
  false,
  "已是新主题 → 不回写（避免每次启动都写 localStorage）",
);

console.log("── 默认对与注册表 ──");

stubStorage({});
state = loadAppearanceState();
assertEqual(state.preferredAppTheme.dark, "tokyo-night", "全新用户的暗色默认 = tokyo-night");
assertEqual(RETIRED_APP_THEMES["mint-dark"], "tokyo-night", "RETIRED_APP_THEMES 映射正确");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
