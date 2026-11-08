import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isLocale, systemLocale, type Locale } from "@oj/core/i18n";
import { I18nProvider, type FindingsMode } from "@oj/core/i18n/react";
import { FINDINGS_MODE_KEY, LANG_KEY, getFindingsMode, getLocale } from "./locale";

export { FINDINGS_MODE_KEY, LANG_KEY, getFindingsMode, getLocale, getT, onLocaleChange } from "./locale";

export function ExtI18n({ children, syncDocument = false }: { children: ReactNode; syncDocument?: boolean }) {
  const [locale, setLocaleState] = useState<Locale>(systemLocale);
  const [mode, setModeState] = useState<FindingsMode>("content");

  useEffect(() => {
    let live = true;
    getLocale().then((l) => live && setLocaleState(l));
    getFindingsMode().then((m) => live && setModeState(m));
    const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== "local") return;
      if (LANG_KEY in changes) {
        const next = changes[LANG_KEY]?.newValue;
        setLocaleState(isLocale(next) ? next : systemLocale());
      }
      if (FINDINGS_MODE_KEY in changes) setModeState(changes[FINDINGS_MODE_KEY]?.newValue === "ui" ? "ui" : "content");
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      live = false;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    browser.storage.local.set({ [LANG_KEY]: l }).catch(() => {});
  }, []);
  const setMode = useCallback((m: FindingsMode) => {
    setModeState(m);
    browser.storage.local.set({ [FINDINGS_MODE_KEY]: m }).catch(() => {});
  }, []);

  return (
    <I18nProvider locale={locale} setLocale={setLocale} findingsMode={mode} setFindingsMode={setMode} syncDocument={syncDocument}>
      {children}
    </I18nProvider>
  );
}
