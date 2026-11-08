import { formatters, type Formatters, type Locale } from "@oj/core/i18n";

const cache = new Map<Locale, Formatters>();

function fmt(locale: Locale): Formatters {
  let f = cache.get(locale);
  if (!f) cache.set(locale, (f = formatters(locale)));
  return f;
}

export function bytes(n: number | null | undefined, locale: Locale = "en"): string {
  if (locale !== "en") return fmt(locale).bytes(n);
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function ago(iso: string | null | undefined, now = Date.now(), locale: Locale = "en"): string {
  return fmt(locale).ago(iso, now);
}

export function countdown(iso: string, now = Date.now(), locale: Locale = "en"): string {
  return fmt(locale).countdown(iso, now);
}

export const short = (text: string, n = 12) => (text.length > n ? `${text.slice(0, n)}…` : text);
