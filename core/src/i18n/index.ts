export const LOCALES = ["en", "es", "fr", "de", "pt"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
};

export const isLocale = (x: unknown): x is Locale => typeof x === "string" && (LOCALES as readonly string[]).includes(x);

export function matchLocale(...tags: (string | readonly string[] | null | undefined)[]): Locale {
  for (const tag of tags.flat()) {
    if (!tag) continue;
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function systemLocale(): Locale {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return matchLocale(nav?.languages ?? [], nav?.language);
}

export function languageName(code: Locale, inLocale: Locale): string {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: "language" }).of(code);
    if (name) return name;
  } catch {}
  return LOCALE_NAMES[code];
}

export type Vars = Record<string, string | number | null | undefined>;
type Dict = Record<string, string>;
export type Messages<E extends Dict> = { [L in Locale]: { [K in keyof E]: string } };

export function defineMessages<E extends Dict>(en: E, others: { [L in Exclude<Locale, "en">]: { [K in keyof E]: string } }): Messages<E> {
  return { en, ...others } as Messages<E>;
}

type PluralBase<K> = K extends `${infer B}_${"one" | "other"}` ? B : never;
export type KeyOf<M> = M extends Messages<infer E> ? keyof E & string : never;
export type Translator<K extends string> = (key: K | PluralBase<K>, vars?: Vars) => string;
export type TranslatorFor<M> = Translator<KeyOf<M>>;

const plurals = new Map<Locale, Intl.PluralRules>();
const numbers = new Map<Locale, Intl.NumberFormat>();

function pluralRules(locale: Locale) {
  let rules = plurals.get(locale);
  if (!rules) plurals.set(locale, (rules = new Intl.PluralRules(locale)));
  return rules;
}

function plainNumber(locale: Locale) {
  let nf = numbers.get(locale);
  if (!nf) numbers.set(locale, (nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false })));
  return nf;
}

export function interpolate(template: string, vars: Vars | undefined, locale: Locale): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null) return whole;
    return typeof v === "number" ? plainNumber(locale).format(v) : v;
  });
}

export function translator<E extends Dict>(messages: Messages<E>, locale: Locale): Translator<keyof E & string> {
  const table = (messages[locale] ?? messages.en) as Dict;
  const base = messages.en as Dict;
  return (key, vars) => {
    let k: string = key;
    if (!(k in base) && vars && typeof vars.count === "number") {
      const form = `${k}_${pluralRules(locale).select(vars.count)}`;
      k = form in base ? form : `${k}_other`;
    }
    return interpolate(table[k] ?? base[k] ?? k, vars, locale);
  };
}

export const COMMON = defineMessages(
  {
    language: "Language",
    "time.justNow": "just now",
    "time.secondsAgo": "{n}s ago",
    "time.minutesAgo": "{n}m ago",
    "time.hoursAgo": "{n}h ago",
    "time.daysAgo": "{n}d ago",
    "time.destroying": "destroying…",
    "dur.s": "{s}s",
    "dur.ms": "{m}m {s}s",
    "dur.hm": "{h}h {m}m",
    "dur.dh": "{d}d {h}h",
    "unit.B": "B",
    "unit.KB": "KB",
    "unit.MB": "MB",
    "unit.GB": "GB",
  },
  {
    es: {
      language: "Idioma",
      "time.justNow": "ahora mismo",
      "time.secondsAgo": "hace {n} s",
      "time.minutesAgo": "hace {n} min",
      "time.hoursAgo": "hace {n} h",
      "time.daysAgo": "hace {n} d",
      "time.destroying": "destruyendo…",
      "dur.s": "{s} s",
      "dur.ms": "{m} min {s} s",
      "dur.hm": "{h} h {m} min",
      "dur.dh": "{d} d {h} h",
      "unit.B": "B",
      "unit.KB": "KB",
      "unit.MB": "MB",
      "unit.GB": "GB",
    },
    fr: {
      language: "Langue",
      "time.justNow": "à l’instant",
      "time.secondsAgo": "il y a {n} s",
      "time.minutesAgo": "il y a {n} min",
      "time.hoursAgo": "il y a {n} h",
      "time.daysAgo": "il y a {n} j",
      "time.destroying": "destruction…",
      "dur.s": "{s} s",
      "dur.ms": "{m} min {s} s",
      "dur.hm": "{h} h {m} min",
      "dur.dh": "{d} j {h} h",
      "unit.B": "o",
      "unit.KB": "Ko",
      "unit.MB": "Mo",
      "unit.GB": "Go",
    },
    de: {
      language: "Sprache",
      "time.justNow": "gerade eben",
      "time.secondsAgo": "vor {n} s",
      "time.minutesAgo": "vor {n} Min.",
      "time.hoursAgo": "vor {n} Std.",
      "time.daysAgo": "vor {n} T.",
      "time.destroying": "wird vernichtet…",
      "dur.s": "{s} s",
      "dur.ms": "{m} min {s} s",
      "dur.hm": "{h} h {m} min",
      "dur.dh": "{d} T. {h} h",
      "unit.B": "B",
      "unit.KB": "KB",
      "unit.MB": "MB",
      "unit.GB": "GB",
    },
    pt: {
      language: "Idioma",
      "time.justNow": "agora mesmo",
      "time.secondsAgo": "há {n} s",
      "time.minutesAgo": "há {n} min",
      "time.hoursAgo": "há {n} h",
      "time.daysAgo": "há {n} d",
      "time.destroying": "destruindo…",
      "dur.s": "{s} s",
      "dur.ms": "{m} min {s} s",
      "dur.hm": "{h} h {m} min",
      "dur.dh": "{d} d {h} h",
      "unit.B": "B",
      "unit.KB": "KB",
      "unit.MB": "MB",
      "unit.GB": "GB",
    },
  },
);

export function formatters(locale: Locale) {
  const t = translator(COMMON, locale);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    locale,
    number: (n: number, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, opts).format(n),
    fixed: (n: number, digits: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n),
    list: (items: string[]) => (items.length < 2 ? (items[0] ?? "") : new Intl.ListFormat(locale, { type: "conjunction" }).format(items)),
    date: (iso: string | number | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }) => new Intl.DateTimeFormat(locale, opts).format(new Date(iso)),
    time: (iso: string | number | Date, opts: Intl.DateTimeFormatOptions = { timeStyle: "short" }) => new Intl.DateTimeFormat(locale, opts).format(new Date(iso)),
    bytes(n: number | null | undefined): string {
      if (!n) return `0 ${t("unit.B")}`;
      const units = ["unit.B", "unit.KB", "unit.MB", "unit.GB"] as const;
      const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
      const digits = i ? 1 : 0;
      return `${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n / 1024 ** i)} ${t(units[i]!)}`;
    },
    ago(iso: string | null | undefined, now = Date.now()): string {
      if (!iso) return "";
      const s = Math.round((now - new Date(iso).getTime()) / 1000);
      if (s < 5) return t("time.justNow");
      if (s < 60) return t("time.secondsAgo", { n: s });
      if (s < 3600) return t("time.minutesAgo", { n: Math.floor(s / 60) });
      if (s < 86400) return t("time.hoursAgo", { n: Math.floor(s / 3600) });
      return t("time.daysAgo", { n: Math.floor(s / 86400) });
    },
    countdown(iso: string, now = Date.now()): string {
      const s = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
      if (s === 0) return t("time.destroying");
      if (s < 60) return t("dur.s", { s });
      if (s < 3600) return t("dur.ms", { m: Math.floor(s / 60), s: locale === "en" ? s % 60 : pad(s % 60) });
      if (s < 86400) return t("dur.hm", { h: Math.floor(s / 3600), m: locale === "en" ? Math.floor((s % 3600) / 60) : pad(Math.floor((s % 3600) / 60)) });
      return t("dur.dh", { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600) });
    },
  };
}

export type Formatters = ReturnType<typeof formatters>;

export { detectLanguage, detectLocale, type LanguageGuess } from "./lang";
