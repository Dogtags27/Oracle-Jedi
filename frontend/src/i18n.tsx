import { useCallback, useState, type ReactNode } from "react";
import { isLocale, systemLocale, type Locale } from "@oj/core/i18n";
import { I18nProvider, type FindingsMode } from "@oj/core/i18n/react";

const LANG_KEY = "avaran:lang";
const MODE_KEY = "avaran:findings";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function initialLocale(): Locale {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (isLocale(fromUrl)) return fromUrl;
  } catch {}
  const saved = read(LANG_KEY);
  return isLocale(saved) ? saved : systemLocale();
}

export function AppI18n({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [mode, setModeState] = useState<FindingsMode>(() => (read(MODE_KEY) === "ui" ? "ui" : "content"));
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    write(LANG_KEY, l);
  }, []);
  const setMode = useCallback((m: FindingsMode) => {
    setModeState(m);
    write(MODE_KEY, m);
  }, []);
  return (
    <I18nProvider locale={locale} setLocale={setLocale} findingsMode={mode} setFindingsMode={setMode} syncDocument>
      {children}
    </I18nProvider>
  );
}
