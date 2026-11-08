import { describe, expect, it } from "vitest";
import { LOCALES, defineMessages, detectLanguage, formatters, matchLocale, translator } from "./i18n";
import { extractRequest } from "./request";
import { detect, ibanValid, validCpf, validDniNie, validNifPt, validNir, validSteuerId } from "./detect";
import { analyzeAttachment, analyzeLink } from "./links";
import { judgeElement, judgeOpen } from "./clicks";
import { FINDINGS, attachmentReason, checkExplanation, checkSignals, clickText, describeKinds, linkReasons } from "./findings";
import type { CheckResponse } from "./types";

const EMAILS = {
  en: "Hi, this is Maple Street Tax. To finish your return please reply with your W-2 and Social Security number today. Thanks!",
  es: "Hola, le escribimos desde Asesoría Fiscal Martínez. Para terminar su declaración de la renta necesitamos que nos envíe su DNI y la última nómina hoy mismo. Gracias.",
  fr: "Bonjour, nous vous écrivons de la part du Cabinet Dupont. Merci de nous transmettre votre avis d'imposition et votre RIB avant ce soir. Cordialement.",
  de: "Sehr geehrte Damen und Herren, hier ist die Steuerkanzlei Müller. Bitte senden Sie uns Ihre Steuer-ID und die letzte Gehaltsabrechnung noch heute. Mit freundlichen Grüßen",
  pt: "Olá, aqui é a Contabilidade Silva. Para concluir a sua declaração de imposto de renda precisamos que você envie o seu CPF e o último holerite ainda hoje. Obrigado.",
} as const;

describe("language detection (on-device)", () => {
  it("recognises each supported language in a typical email", () => {
    for (const [lang, text] of Object.entries(EMAILS)) expect(detectLanguage(text).lang).toBe(lang);
  });

  it("stays undecided on text too short to tell", () => {
    expect(detectLanguage("Envíe su DNI").lang).toBeNull();
    expect(detectLanguage("").lang).toBeNull();
  });

  it("maps browser language tags to supported locales", () => {
    expect(matchLocale(["pt-BR", "en"])).toBe("pt");
    expect(matchLocale(["hi-IN", "de-AT"])).toBe("de");
    expect(matchLocale(["ja"])).toBe("en");
  });
});

describe("translator", () => {
  const M = defineMessages(
    { "files_one": "{count} file", "files_other": "{count} files", hi: "Hi {name}" },
    {
      es: { "files_one": "{count} archivo", "files_other": "{count} archivos", hi: "Hola {name}" },
      fr: { "files_one": "{count} fichier", "files_other": "{count} fichiers", hi: "Bonjour {name}" },
      de: { "files_one": "{count} Datei", "files_other": "{count} Dateien", hi: "Hallo {name}" },
      pt: { "files_one": "{count} arquivo", "files_other": "{count} arquivos", hi: "Olá {name}" },
    },
  );

  it("interpolates and picks plural forms per locale", () => {
    expect(translator(M, "en")("files", { count: 1 })).toBe("1 file");
    expect(translator(M, "fr")("files", { count: 0 })).toBe("0 fichier");
    expect(translator(M, "de")("files", { count: 3 })).toBe("3 Dateien");
    expect(translator(M, "pt")("hi", { name: "Ana" })).toBe("Olá Ana");
  });

  it("keeps English formatting identical and localises the rest", () => {
    expect(formatters("en").bytes(1536)).toBe("1.5 KB");
    expect(formatters("de").bytes(1536)).toBe("1,5 KB");
    expect(formatters("fr").bytes(1536)).toBe("1,5 Ko");
  });

  it("has every findings string in every language", () => {
    const keys = Object.keys(FINDINGS.en).sort();
    for (const l of LOCALES) expect(Object.keys(FINDINGS[l]).sort()).toEqual(keys);
  });
});

describe("findings follow the email's language", () => {
  it("reads document requests in each language with that language's rules", () => {
    const es = extractRequest(EMAILS.es, "Asesoría Fiscal Martínez <martinez.asesoria@gmail.com>");
    expect(es.language).toBe("es");
    expect(es.requestedItems).toEqual(expect.arrayContaining(["national_id", "tax_return", "pay_stub"]));
    expect(es.pressureSignals).toContain("deadline");
    expect(es.isDocumentRequest).toBe(true);

    const fr = extractRequest(EMAILS.fr);
    expect(fr.requestedItems).toEqual(expect.arrayContaining(["bank_account", "tax_return"]));
    expect(fr.claimedOrg).toBe("Cabinet Dupont");

    const de = extractRequest(EMAILS.de);
    expect(de.requestedItems).toEqual(expect.arrayContaining(["tax_id", "pay_stub"]));
    expect(de.claimedOrg).toBe("Steuerkanzlei Müller");

    const pt = extractRequest(EMAILS.pt);
    expect(pt.requestedItems).toEqual(expect.arrayContaining(["tax_id", "tax_return", "pay_stub"]));
    expect(pt.claimedOrg).toBe("Contabilidade Silva");
  });

  it("spots credential phishing outside English", () => {
    const x = extractRequest("[TRAINING SAMPLE] Su cuenta será bloqueada. Verifique su cuenta e introduzca el código de verificación aquí: https://maple-street-taxdocs.co/v urgente.");
    expect(x.isCredentialRequest).toBe(true);
    expect(x.credentialAsks).toEqual(expect.arrayContaining(["account_verification", "login_code"]));
  });

  it("doesn't read foreign acronyms into ordinary words", () => {
    expect(extractRequest("Das passiert nie wieder, versprochen. Bis morgen!").requestedItems).toEqual([]);
    expect(extractRequest("Lunch tomorrow at noon? I'll bring the slides.").isDocumentRequest).toBe(false);
  });
});

describe("detectors for local identifiers", () => {
  it("validates checksums", () => {
    expect(ibanValid("DE89 3704 0044 0532 0130 00")).toBe(true);
    expect(ibanValid("DE89 3704 0044 0532 0130 01")).toBe(false);
    expect(validDniNie("12345678Z")).toBe(true);
    expect(validDniNie("12345678A")).toBe(false);
    expect(validDniNie("X1234567L")).toBe(true);
    expect(validNir("185057800608491")).toBe(true);
    expect(validSteuerId("12345678911")).toBe(true);
    expect(validCpf("529.982.247-25")).toBe(true);
    expect(validCpf("111.111.111-11")).toBe(false);
    expect(validNifPt("123456789")).toBe(true);
  });

  it("finds IBANs everywhere and national IDs where the language or a label says so", () => {
    const kinds = (text: string) => detect(text).map((f) => [f.kind, f.value]);
    expect(kinds("IBAN: DE89 3704 0044 0532 0130 00 BIC COBADEFFXXX")).toEqual([["iban", "DE89 3704 0044 0532 0130 00"]]);
    expect(kinds("Nombre: Ana Pérez. DNI: 12345678Z. Fecha de nacimiento: 12 de marzo de 1986.")).toEqual([
      ["national_id", "12345678Z"],
      ["dob", "12 de marzo de 1986"],
    ]);
    expect(kinds("Order 12345678Z shipped")).toEqual([]);
    expect(kinds("Numéro de sécurité sociale : 1 85 05 78 006 084 91. Né le 12/05/1985.")).toEqual([
      ["social_insurance", "1 85 05 78 006 084 91"],
      ["dob", "12/05/1985"],
    ]);
    expect(kinds("Ihre Steuer-ID: 12 345 678 911. Geburtsdatum: 12. März 1986.")).toEqual([
      ["tax_id", "12 345 678 911"],
      ["dob", "12. März 1986"],
    ]);
    expect(kinds("CPF 529.982.247-25")).toEqual([["tax_id", "529.982.247-25"]]);
  });

  it("describes findings in the reader's language", () => {
    expect(describeKinds({ ssn: 1, ein: 1 }, ["ssn", "ein"], "en")).toBe("1 Social Security number and 1 EIN");
    expect(describeKinds({ iban: 2, tax_id: 1 }, ["iban", "tax_id"], "pt")).toBe("2 IBANs e 1 número fiscal");
  });
});

describe("structured reasons render in any language and stay identical in English", () => {
  it("link and attachment reasons", () => {
    const link = analyzeLink("https://maplestreettax.co/login", "", { officialDomain: "maplestreettax.com", officialName: "Maple Street Tax" });
    expect(linkReasons(link, "en")).toEqual(link.reasons);
    expect(linkReasons(link, "de")).toEqual(["maplestreettax.co imitiert maplestreettax.com"]);
    const named = analyzeLink("https://other.example/x", "", { officialDomain: "maplestreettax.com", officialName: "Maple Street Tax" });
    expect(named.reasons).toEqual(["Not Maple Street Tax's official site (maplestreettax.com)"]);
    const att = analyzeAttachment("W2_2025.pdf.exe");
    expect(att.reason).toBe("Disguised as a document, but it's really .exe. Opening it runs a program on your computer");
    expect(attachmentReason(att, "fr")).toMatch(/^Déguisé en document/);
  });

  it("click guard reasons match the catalog", () => {
    const page = "https://news.example/";
    const verdicts = [
      judgeElement({ label: "Close", hints: "", href: "https://ads.example/x", handlerUrls: [], overlay: false }, page),
      judgeElement({ label: "", hints: "", href: "https://ads.example/x", handlerUrls: [], overlay: true }, page),
      judgeElement({ label: "bank.example", hints: "", href: "https://evil.example/", handlerUrls: [], overlay: false }, page),
      judgeOpen("https://pop.example/", page, { label: "", hints: "", anchorHref: "https://news.example/a", looksClickable: true, overlay: false }),
    ];
    for (const v of verdicts) {
      expect(v.msg).toBeDefined();
      expect(clickText(v.msg!, "en")).toBe(v.reason);
    }
    expect(clickText(verdicts[0]!.msg!, "de")).toBe("„Close“ sieht aus, als würde es etwas schließen, führt Sie aber zu ads.example");
  });

  it("recognises dismiss buttons in other languages", () => {
    const page = "https://news.example/";
    for (const label of ["Cerrar", "Fermer", "Schließen", "Fechar", "No, gracias", "Nein danke"]) {
      expect(judgeElement({ label, hints: "", href: "https://ads.example/x", handlerUrls: [], overlay: false }, page).kind).toBe("dismiss");
    }
  });

  it("backend facts render the verdict in the reader's language", () => {
    const r: CheckResponse = {
      verdict: "mismatch",
      claimedOrg: "Maple Street Tax",
      officialDomain: "maplestreettax.com",
      evidence: [],
      signals: ["maplestreet.tax.help@gmail.com doesn't appear on maplestreettax.com", "Sent from a free personal email account"],
      explanation: "",
      latencyMs: 1,
      source: "live",
      providers: [],
      sender: "maplestreet.tax.help@gmail.com",
      facts: [{ code: "sender_absent", vars: { sender: "maplestreet.tax.help@gmail.com", domain: "maplestreettax.com" } }, { code: "personal_email" }],
    };
    expect(checkSignals(r, "en")).toEqual(r.signals);
    expect(checkSignals(r, "es")[1]).toBe("Enviado desde una cuenta de correo personal gratuita");
    expect(checkExplanation(r, "en")).toBe(
      "Maple Street Tax's official site is maplestreettax.com, and maplestreet.tax.help@gmail.com doesn't appear anywhere on it. Don't send documents to this address.",
    );
    expect(checkExplanation({ ...r, facts: undefined, explanation: "legacy" }, "fr")).toBe("legacy");
  });
});
