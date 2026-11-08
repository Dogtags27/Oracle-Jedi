import { isLocale, systemLocale, translator, type Locale, type Messages, type Translator } from "@oj/core/i18n";

export type FindingsMode = "content" | "ui";

export const LANG_KEY = "lang";
export const FINDINGS_MODE_KEY = "findingsMode";

export async function getLocale(): Promise<Locale> {
  try {
    const saved = (await browser.storage.local.get(LANG_KEY))[LANG_KEY];
    if (isLocale(saved)) return saved;
  } catch {}
  return systemLocale();
}

export async function getFindingsMode(): Promise<FindingsMode> {
  try {
    return (await browser.storage.local.get(FINDINGS_MODE_KEY))[FINDINGS_MODE_KEY] === "ui" ? "ui" : "content";
  } catch {
    return "content";
  }
}

export function onLocaleChange(cb: (l: Locale) => void): () => void {
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area !== "local" || !(LANG_KEY in changes)) return;
    const next = changes[LANG_KEY]?.newValue;
    cb(isLocale(next) ? next : systemLocale());
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

export async function getT<E extends Record<string, string>>(messages: Messages<E>): Promise<Translator<keyof E & string>> {
  return translator(messages, await getLocale());
}
