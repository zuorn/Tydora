import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

// 启动计时埋点（i18n 是 main.tsx 早期 import，因此这部分运行极早）
// 必须在"副作用发生前"检查 window 是否存在，避免 SSR / 测试环境 undefined
const bootStamp = (label: string) => {
  try {
    const w = globalThis as unknown as { __TYDORA_BOOT__?: Record<string, number>; performance?: Performance };
    if (!w.__TYDORA_BOOT__) w.__TYDORA_BOOT__ = {};
    const now = w.performance?.now?.() ?? Date.now();
    w.__TYDORA_BOOT__[label] = now;
    w.performance?.mark?.(`boot:${label}`);
  } catch { /* ignore */ }
};
const bootStart = (label: string) => {
  bootStamp(`start:${label}`);
  try { (globalThis as any).console?.time?.(`BOOT:${label}`); } catch { /* ignore */ }
};
const bootEnd = (label: string) => {
  bootStamp(`end:${label}`);
  try { (globalThis as any).console?.timeEnd?.(`BOOT:${label}`); } catch { /* ignore */ }
};

bootStart("i18n_full_init_sync");
bootStamp("i18n_before_getStoredLanguage");

const STORAGE_KEY = "zmd-language";

export const SUPPORTED_LANGUAGES = [
  { code: "zh-CN", label: "简体中文" },
  { code: "en-US", label: "English" },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["code"];

function getStoredLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.some((l) => l.code === stored)) {
      return stored as SupportedLanguage;
    }
  } catch {
    // localStorage unavailable
  }
  return "en-US";
}

export function persistLanguage(lang: SupportedLanguage): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage unavailable
  }
}

bootStamp("i18n_before_resources_object");
const resources = {
  "zh-CN": { translation: zhCN },
  "en-US": { translation: enUS },
};
bootStamp("i18n_before_init_call");

i18n.use(initReactI18next).init({
  resources,
  lng: getStoredLanguage(),
  fallbackLng: "en-US",
  interpolation: {
    escapeValue: false, // React already escapes
  },
});

bootStamp("i18n_after_init_call");
bootEnd("i18n_full_init_sync");

export default i18n;
