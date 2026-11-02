"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { TRANSLATIONS } from "./translations";

export type Lang = "en" | "hi" | "kn";

export const LANGUAGES: { code: Lang; label: string; locale: string }[] = [
  { code: "en", label: "English", locale: "en-IN" },
  { code: "hi", label: "हिन्दी", locale: "hi-IN" },
  { code: "kn", label: "ಕನ್ನಡ", locale: "kn-IN" },
];

const KEY = "pikop-lang";
const listeners = new Set<() => void>();

function read(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "hi" || v === "kn" || v === "en") return v;
  } catch {}
  return "en";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

// Fills {name}-style placeholders. English text is the key, so a missing translation just shows English.
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const text = (lang !== "en" && TRANSLATIONS[key]?.[lang]) || key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Record<string, string | number>) => string; locale: string };
const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k, v) => translate("en", k, v), locale: "en-IN" });

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Server and first client render use English; the saved choice applies right after hydration.
  const lang = useSyncExternalStore(subscribe, read, () => "en" as Lang);
  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(KEY, l);
      document.documentElement.lang = l;
    } catch {}
    listeners.forEach((cb) => cb());
  }, []);
  const value = useMemo<Ctx>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => translate(lang, key, vars),
      locale: LANGUAGES.find((x) => x.code === lang)!.locale,
    }),
    [lang, setLang],
  );
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export function useT() {
  return useContext(LangCtx);
}
