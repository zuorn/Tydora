import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import i18n, { persistLanguage, type SupportedLanguage } from "./index";

interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en-US",
  setLanguage: () => {},
});

const EVENT_NAME = "language-changed";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    return (i18n.language as SupportedLanguage) || "en-US";
  });

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    i18n.changeLanguage(lang);
    persistLanguage(lang);
    setLanguageState(lang);
    // 通知其他窗口语言已变化
    emit(EVENT_NAME, lang).catch(() => {});
  }, []);

  // 监听来自其他窗口的语言变化事件
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<SupportedLanguage>(EVENT_NAME, (event) => {
      const newLang = event.payload;
      i18n.changeLanguage(newLang);
      persistLanguage(newLang);
      setLanguageState(newLang);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // Listen for i18n language changes from outside
  useEffect(() => {
    const handler = (lng: string) => {
      setLanguageState(lng as SupportedLanguage);
    };
    i18n.on("languageChanged", handler);
    return () => {
      i18n.off("languageChanged", handler);
    };
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
