import type { Locale } from "./index";

const WORDS: Record<Locale, string> = {
  en: "the and to of a in is that for it you your with on this be are we our have will please from by at as not or can if us my i me was has been would should here there what which an do any all they their them need thanks thank hello hi dear regards attached below these those just about into than when",
  es: "el la los las de del y en que es un una por para con no su sus se lo le les al como más pero este esta estos estas ya muy también usted ustedes nos nuestro nuestra hola gracias saludos estimado estimada favor hoy sí mi son está están ha han hay puede debe sobre cuando donde desde hasta porque adjunto envíe necesitamos atentamente cordialmente",
  fr: "le la les de des du et en un une est que qui pour dans sur pas ne vous votre vos nous notre nos avec par au aux ce cette ces il elle sont être avoir été plus merci bonjour cordialement madame monsieur si ou mais comme aujourd'hui se sa son ses leur très tout toute veuillez afin ci-joint également avant",
  de: "der die das den dem des und ist nicht zu mit sie ihr ihre ihren ihrem ein eine einen einem auf für von im wir uns unser unsere bitte danke hallo sehr geehrte geehrter freundlichen grüßen sind werden wird haben hat auch oder aber wenn dass noch nach bei aus zum zur es ich sich kann können müssen heute ihnen damit",
  pt: "o a os as de do da dos das e em no na nos nas um uma que é para com não por se seu sua seus suas ao aos à mais como mas você vocês nós nosso nossa olá obrigado obrigada atenciosamente prezado prezada favor hoje está estão são foi ser ter tem também já muito pelo pela isso este esta anexo envie precisamos",
};

const LOCALES = Object.keys(WORDS) as Locale[];

const WEIGHT = (() => {
  const seen = new Map<string, Locale[]>();
  for (const l of LOCALES) for (const w of WORDS[l].split(" ")) seen.set(w, [...(seen.get(w) ?? []), l]);
  return seen;
})();

const HINTS: [RegExp, Partial<Record<Locale, number>>][] = [
  [/ñ/g, { es: 3 }],
  [/[¿¡]/g, { es: 3 }],
  [/ci[oó]n(es)?\b/g, { es: 1.5 }],
  [/[ãõ]/g, { pt: 3 }],
  [/ç[ãõ]/g, { pt: 2 }],
  [/ç/g, { pt: 0.5, fr: 0.5 }],
  [/(lh|nh)[aeiou]/g, { pt: 0.4 }],
  [/[èêëîïûùœ]/g, { fr: 1.5 }],
  [/(^|[\s(])(qu|l|d|n|j|c|s)['’][a-zàâéèêîôûh]/g, { fr: 2 }],
  [/eau(x)?\b/g, { fr: 0.8 }],
  [/[äöüß]/g, { de: 3 }],
  [/sch/g, { de: 0.4 }],
  [/(ung|keit|heit|lich)(en)?\b/g, { de: 0.8 }],
  [/[áíóú]/g, { es: 0.5, pt: 0.5 }],
  [/\b\w+ing\b/g, { en: 0.6 }],
  [/\b\w+'(s|t|re|ll|ve)\b/g, { en: 1 }],
];

export interface LanguageGuess {
  lang: Locale | null;
  confidence: number;
  scores: Record<Locale, number>;
}

export function detectLanguage(input: string): LanguageGuess {
  const text = input
    .slice(0, 6000)
    .toLowerCase()
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/g, " ")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, " ")
    .replace(/\[training sample\]/g, " ");
  const scores = Object.fromEntries(LOCALES.map((l) => [l, 0])) as Record<Locale, number>;
  const tokens = text.match(/[\p{L}]+(?:['’-][\p{L}]+)*/gu) ?? [];
  for (const raw of tokens) {
    const word = raw.replace(/’/g, "'");
    const langs = WEIGHT.get(word) ?? (word.includes("'") ? WEIGHT.get(word.split("'")[0]!) : undefined);
    if (!langs) continue;
    for (const l of langs) scores[l] += 1 / langs.length;
  }
  for (const [re, add] of HINTS) {
    const hits = text.match(re)?.length ?? 0;
    if (!hits) continue;
    for (const [l, w] of Object.entries(add) as [Locale, number][]) scores[l] += Math.min(hits, 12) * w;
  }
  const ranked = [...LOCALES].sort((a, b) => scores[b] - scores[a]);
  const best = ranked[0]!;
  const second = scores[ranked[1]!];
  const total = LOCALES.reduce((s, l) => s + scores[l], 0);
  const confidence = total ? scores[best] / total : 0;
  const lang = scores[best] >= 3 && scores[best] >= second * 1.35 ? best : null;
  return { lang, confidence: Math.round(confidence * 100) / 100, scores };
}

export const detectLocale = (text: string): Locale | null => detectLanguage(text).lang;
