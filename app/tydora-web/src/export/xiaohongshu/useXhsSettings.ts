import { useCallback, useState } from "react";
import { loadXhsSettings, saveXhsSettings } from "./settings";
import type { XhsSettings } from "./types";

/** 小红书导出设置状态，改动即时持久化到 localStorage */
export function useXhsSettings() {
  const [settings, setSettings] = useState<XhsSettings>(() => loadXhsSettings());

  const updateSettings = useCallback((patch: Partial<XhsSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveXhsSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}
