import { getDomain } from "tldts";
import type { CheckRequest } from "./types";
import { detectLanguage } from "./i18n/lang";
import type { Locale } from "./i18n";

export const PERSONAL_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "zoho.com", "yandex.com", "mail.com",
  "gmx.de", "gmx.net", "web.de", "t-online.de", "freenet.de", "orange.fr", "free.fr", "laposte.net", "sfr.fr", "wanadoo.fr",
  "yahoo.es", "yahoo.fr", "yahoo.de", "hotmail.es", "hotmail.fr", "outlook.es", "outlook.fr", "outlook.de", "terra.com.br",
  "uol.com.br", "bol.com.br", "yahoo.com.br", "hotmail.com.br", "sapo.pt", "outlook.pt", "telefonica.net",
]);

export const registrableDomain = (hostOrUrl: string) => getDomain(hostOrUrl.toLowerCase()) ?? hostOrUrl.toLowerCase();

export type RequestItem =
  | "w2"
  | "form1099"
  | "form1098"
  | "ssn"
  | "itin"
  | "passport"
  | "photo_id"
  | "national_id"
  | "tax_id"
  | "social_insurance"
  | "bank_statement"
  | "bank_account"
  | "tax_return"
  | "pay_stub"
  | "dob"
  | "medical";

export type CredentialAsk = "password" | "login_code" | "account_verification" | "payment_details";
export type PressureSignal = "urgency" | "deadline" | "penalty" | "odd_payment" | "secrecy";

interface Pack {
  items: [RegExp, RequestItem][];
  ask: RegExp;
  creds: [RegExp, CredentialAsk][];
  credAction: RegExp;
  pressure: [RegExp, PressureSignal][];
  org: RegExp;
  intro: RegExp;
  anywhere: RegExp;
}

const B = "(?<![\\p{L}\\p{N}_])";
const E = "(?![\\p{L}\\p{N}_])";
const word = (src: string) => new RegExp(`${B}(?:${src})${E}`, "iu");
const stem = (src: string) => new RegExp(`${B}(?:${src})`, "iu");
const acro = (src: string) => new RegExp(`${B}(?:${src})${E}`, "u");
const anyCase = (phrase: string) => phrase.replace(/^(\p{L})/u, (m) => `[${m.toLowerCase()}${m.toUpperCase()}]`);
const NAME = "(\\p{Lu}[\\p{L}\\p{N}&'.-]*(?:\\s+(?:(?:de|del|la|las|los|y|du|des|et|le|und|für|e|do|da|dos|das)\\s+)?[\\p{Lu}&][\\p{L}\\p{N}&'.-]*){0,4})";
const intro = (phrases: string[]) => new RegExp(`${B}(?:${phrases.map(anyCase).join("|")})\\s+${NAME}`, "gu");
const anywhere = (lead: string[], tail: string[]) =>
  new RegExp(`${B}((?:(?:${lead.join("|")})\\s+\\p{Lu}[\\p{L}'&-]+(?:\\s+\\p{Lu}[\\p{L}'&-]+){0,2})|(?:\\p{Lu}[\\p{L}'&-]+(?:\\s+\\p{Lu}[\\p{L}'&-]+){0,3}\\s+(?:${tail.join("|")})))${E}`, "u");

const EN: Pack = {
  items: [
    [/\bw-?2s?\b/i, "w2"],
    [/\b1099(-[a-z]+)?\b/i, "form1099"],
    [/\b1098\b/i, "form1098"],
    [/social security( number)?|\bssn\b/i, "ssn"],
    [/\bitin\b/i, "itin"],
    [/passport/i, "passport"],
    [/driver'?s? licen[cs]e|photo id|government[- ]issued id|\bid card\b/i, "photo_id"],
    [/national insurance number|social insurance number/i, "social_insurance"],
    [/bank statements?/i, "bank_statement"],
    [/routing (number|#)|account (number|#)|bank account|\biban\b/i, "bank_account"],
    [/tax returns?/i, "tax_return"],
    [/pay ?stubs?|payslips?/i, "pay_stub"],
    [/date of birth|\bdob\b/i, "dob"],
    [/medical records?|insurance card/i, "medical"],
  ],
  ask: /\b(send|upload|attach|provide|submit|forward|reply with|email (us|me)|share|scan)\b/i,
  creds: [
    [/\bpass(word|code)\b/i, "password"],
    [/\b(one[- ]time|verification|security|login|sign[- ]in|2fa|mfa|authentication|6[- ]digit) (code|pin|number)\b/i, "login_code"],
    [/\b(verify|confirm|validate|unlock|reactivate|restore|re-?validate) (your )?(account|identity|login|mailbox|email|credentials)\b/i, "account_verification"],
    [/\b(card|billing|payment|bank) (details|information|info)\b|\bupdate (your )?(payment|billing)\b/i, "payment_details"],
  ],
  credAction: /\b(click|tap|follow|enter|reply|log ?in|sign ?in|visit|open|update|confirm|verify)\b/i,
  pressure: [
    [/\burgent(ly)?\b|\bimmediately\b|\basap\b/i, "urgency"],
    [/within (24|48) hours|by (today|tonight|end of day)|\btoday\b/i, "deadline"],
    [/suspend|penalt|fine|legal action|locked/i, "penalty"],
    [/gift card|wire transfer|crypto|bitcoin/i, "odd_payment"],
    [/don'?t (call|tell)|keep this (confidential|between us)/i, "secrecy"],
  ],
  org: /\b(tax|taxes|cpa|cpas|accounting|accountants|bookkeeping|financial|services|group|partners|associates|llc|inc|ltd|law|legal|clinic|health|medical|realty|mortgage|bank|credit union|advisors|consulting)\b/i,
  intro: /\b(?:this is|from|on behalf of|team at|here at)\s+([A-Z][\w&'.-]*(?:\s+[A-Z&][\w&'.-]*){0,4})/g,
  anywhere: /\b([A-Z][\w&'-]+(?:\s+[A-Z&][\w&'-]+){0,3}\s+(?:Tax|CPA|CPAs|Accounting|Financial|Services|Group|Partners|Associates|LLC|Inc))\b/,
};

const ES: Pack = {
  items: [
    [word("n[úu]mero del? seguro social|seguro social"), "ssn"],
    [word("n[úu]mero de (la )?seguridad social|n[º°o]\\.? de afiliaci[óo]n"), "social_insurance"],
    [acro("NUSS|NAF"), "social_insurance"],
    [word("documento nacional de identidad|c[ée]dula( de identidad)?|tarjeta de residencia"), "national_id"],
    [acro("DNI|NIE|TIE"), "national_id"],
    [word("n[úu]mero de identificaci[óo]n (fiscal|tributaria)|identificaci[óo]n tributaria"), "tax_id"],
    [acro("NIF|CIF|RFC|CUIT|CUIL|RUT"), "tax_id"],
    [word("pasaportes?"), "passport"],
    [word("documento de identidad|identificaci[óo]n (oficial|con foto)|(carn[ée]|licencia|permiso) de conducir|credencial (de elector|del ine)"), "photo_id"],
    [word("extractos? bancarios?|extractos? de (la )?cuenta|estados? de cuenta"), "bank_statement"],
    [word("n[úu]mero de cuenta|cuenta bancaria|datos bancarios|c[óo]digo swift"), "bank_account"],
    [acro("IBAN|CLABE|BIC|SWIFT"), "bank_account"],
    [word("declaraci[óo]n de (la )?(renta|impuestos?|irpf)|declaraci[óo]n anual|modelo 100"), "tax_return"],
    [word("n[óo]minas?|recibos? de (sueldo|n[óo]mina|salario)|tal[óo]n de pago|colilla de pago"), "pay_stub"],
    [word("fecha de nacimiento"), "dob"],
    [word("historial(es)? m[ée]dicos?|expediente m[ée]dico|tarjeta sanitaria|tarjeta del seguro( m[ée]dico)?"), "medical"],
  ],
  ask: word("env[íi]e(nos)?|enviar|env[íi]en|m[áa]nde(nos)?|adjunte|adjuntar|suba|subir|cargue|cargar|proporcione|proporcionar|facilite|facilitar|remita|remitir|comparta|compartir|escanee|escanear|reenv[íi]e|responda con|necesitamos"),
  creds: [
    [word("contrase[ñn]as?|clave de acceso"), "password"],
    [word("c[óo]digo (de )?(verificaci[óo]n|seguridad|acceso|confirmaci[óo]n|un solo uso)|c[óo]digo de [46] d[íi]gitos"), "login_code"],
    [acro("OTP"), "login_code"],
    [word("(verifique|verificar|confirme|confirmar|valide|validar|desbloquee|desbloquear|reactive|reactivar|restablezca|restablecer) (su |tu )?(cuenta|identidad|acceso|buz[óo]n|correo|credenciales)"), "account_verification"],
    [word("datos (de (la )?)?(tarjeta|pago|facturaci[óo]n)|actualice (su )?(pago|m[ée]todo de pago|facturaci[óo]n)"), "payment_details"],
  ],
  credAction: word("haga clic|pulse|clique|ingrese|introduzca|inicie sesi[óo]n|acceda|visite|abra|actualice|confirme|verifique|responda"),
  pressure: [
    [word("urgente(mente)?|inmediatamente|de inmediato|cuanto antes|lo antes posible"), "urgency"],
    [word("(en|dentro de) (las )?(24|48) horas|antes de (hoy|esta noche|ma[ñn]ana)|hoy mismo|hoy"), "deadline"],
    [stem("suspen|sanci[óo]n|sancion|multa|recargo|acciones legales|bloquead|embargo"), "penalty"],
    [word("tarjetas? (de )?regalo|transferencia|cripto(monedas?)?|bitcoin"), "odd_payment"],
    [word("no (llame|se lo diga|lo comente)|confidencial|entre nosotros"), "secrecy"],
  ],
  org: word("asesor[íi]a|asesores|gestor[íi]a|gestores|contables?|contadores?|contadur[íi]a|abogados|bufete|despacho|consultor[íi]a|consultora|cl[íi]nica|banco|financiera|seguros|inmobiliaria|s\\.?l\\.?u?|s\\.?a\\.?"),
  intro: intro(["le escribe", "le escribimos desde", "somos", "de parte de", "en nombre de", "atentamente,"]),
  anywhere: anywhere(["Asesor[íi]a", "Gestor[íi]a", "Despacho", "Bufete", "Contadores", "Consultor[íi]a", "Cl[íi]nica", "Banco"], ["Asesores", "Contadores", "Abogados", "S\\.?L\\.?", "S\\.?A\\.?"]),
};

const FR: Pack = {
  items: [
    [word("(num[ée]ro de )?s[ée]curit[ée] sociale|carte vitale|num[ée]ro d'assur[ée]"), "social_insurance"],
    [acro("NIR"), "social_insurance"],
    [word("carte (nationale )?d'identit[ée]|titre de s[ée]jour"), "national_id"],
    [acro("CNI"), "national_id"],
    [word("num[ée]ro fiscal|num[ée]ro d'identification fiscale|num[ée]ro de contribuable"), "tax_id"],
    [acro("SPI"), "tax_id"],
    [word("passeports?"), "passport"],
    [word("pi[èe]ce d'identit[ée]|permis de conduire|justificatif d'identit[ée]"), "photo_id"],
    [word("relev[ée]s? (de compte|bancaires?)"), "bank_statement"],
    [word("relev[ée] d'identit[ée] bancaire|coordonn[ée]es bancaires|num[ée]ro de compte|code (swift|bic)"), "bank_account"],
    [acro("RIB|IBAN|BIC"), "bank_account"],
    [word("avis d'(imposition|imp[ôo]t)|d[ée]claration (de revenus|d'imp[ôo]ts?|fiscale)"), "tax_return"],
    [word("bulletins? de (paie|salaire)|fiches? de paie"), "pay_stub"],
    [word("date de naissance"), "dob"],
    [word("dossier m[ée]dical|attestation de mutuelle|carte de mutuelle|carte vitale"), "medical"],
  ],
  ask: word("envoyez|envoyer|renvoyez|joindre|joignez|transmettez|transmettre|fournissez|fournir|d[ée]posez|t[ée]l[ée]versez|t[ée]l[ée]chargez|partagez|scannez|r[ée]pondez avec|faire parvenir|nous avons besoin"),
  creds: [
    [word("mots? de passe|code secret"), "password"],
    [word("code (de )?(v[ée]rification|s[ée]curit[ée]|connexion|confirmation|validation)|code [àa] usage unique|code [àa] [46] chiffres"), "login_code"],
    [word("(v[ée]rifie[rz]|confirme[rz]|valide[rz]|d[ée]bloque[rz]|r[ée]active[rz]|restaure[rz]) (votre |ton )?(compte|identit[ée]|acc[èe]s|messagerie|bo[îi]te mail|identifiants)"), "account_verification"],
    [word("(coordonn[ée]es|informations|donn[ée]es) (bancaires|de paiement|de (la )?carte)|mettre [àa] jour (vos )?(informations de paiement|moyen de paiement|facturation)"), "payment_details"],
  ],
  credAction: word("cliquez|cliquer|appuyez|saisissez|entrez|connectez-vous|identifiez-vous|visitez|ouvrez|mettez [àa] jour|confirmez|v[ée]rifiez|r[ée]pondez"),
  pressure: [
    [word("urgent(e|es)?|imm[ée]diatement|sans d[ée]lai|au plus vite|d[èe]s que possible"), "urgency"],
    [word("(sous|dans les|d'ici) (24|48) ?h(eures)?|d'ici ce soir|avant ce soir|aujourd'hui|avant demain"), "deadline"],
    [stem("suspen|p[ée]nalit|amende|majoration|poursuites|bloqu|recouvrement"), "penalty"],
    [word("cartes? cadeaux?|virement|crypto(monnaies?)?|bitcoin|coupons? (pcs|transcash)"), "odd_payment"],
    [word("n'appelez pas|ne (le )?dites (rien|pas)|confidentiel(le)?|entre nous"), "secrecy"],
  ],
  org: word("cabinet|experts?-comptables?|comptabilit[ée]|comptable|avocats?|notaire|fiduciaire|banque|assurances?|mutuelle|clinique|sarl|sas|eurl|scp"),
  intro: intro(["de la part du", "de la part de la", "de la part de", "au nom du", "au nom de la", "au nom de", "ici le", "c'est le"]),
  anywhere: anywhere(["Cabinet", "Fiduciaire", "Banque", "Clinique", "Mutuelle"], ["SARL", "SAS", "EURL", "SCP", "Conseil", "Comptabilit[ée]", "Avocats"]),
};

const DE: Pack = {
  items: [
    [word("sozialversicherungsnummer|rentenversicherungsnummer|sv-nummer|versicherungsnummer"), "social_insurance"],
    [word("personalausweis(nummer|es)?|ausweisnummer|aufenthaltstitel"), "national_id"],
    [word("steuer-?id|steueridentifikationsnummer|steuer-identifikationsnummer|steuernummer"), "tax_id"],
    [acro("IdNr|USt-?IdNr"), "tax_id"],
    [word("reisepass|passnummer"), "passport"],
    [word("ausweis(dokument|kopie)?|lichtbildausweis|f[üu]hrerschein|identit[äa]tsnachweis"), "photo_id"],
    [word("kontoausz[üu]ge?"), "bank_statement"],
    [word("bankverbindung|kontonummer|kontodaten|bankdaten"), "bank_account"],
    [acro("IBAN|BIC"), "bank_account"],
    [word("steuererkl[äa]rung|steuerbescheid|einkommensteuer(erkl[äa]rung|bescheid)?|lohnsteuerbescheinigung"), "tax_return"],
    [word("gehaltsabrechnung(en)?|lohnabrechnung(en)?|verdienstbescheinigung(en)?|lohnzettel"), "pay_stub"],
    [word("geburtsdatum|geboren am"), "dob"],
    [word("krankenakte|patientenakte|krankenversicherungskarte|gesundheitskarte|versichertenkarte|befunde"), "medical"],
  ],
  ask: word("senden|schicken|[üu]bermitteln|[üu]bersenden|zusenden|zukommen lassen|hochladen|laden sie|anh[äa]ngen|beif[üu]gen|einreichen|bereitstellen|teilen|scannen|antworten sie mit|ben[öo]tigen"),
  creds: [
    [word("passwort|kennwort|zugangsdaten"), "password"],
    [word("(best[äa]tigungs|sicherheits|verifizierungs|anmelde|einmal|login|zugangs)-?code|[46]-stelligen code|einmalpasswort"), "login_code"],
    [word("(ihr(e|en)? )?(konto|identit[äa]t|zugang|postfach|zugangsdaten)( \\p{L}+){0,2} (verifizieren|best[äa]tigen|validieren|entsperren|reaktivieren|wiederherstellen|freischalten)|(verifizieren|best[äa]tigen|entsperren|reaktivieren) sie ihr(e|en)? (konto|identit[äa]t|zugang|postfach|zugangsdaten)|kontoverifizierung|identit[äa]tspr[üu]fung"), "account_verification"],
    [word("(zahlungs|karten|kreditkarten|bank)(daten|informationen|angaben)|zahlungs(methode|informationen) aktualisieren"), "payment_details"],
  ],
  credAction: word("klicken|tippen|eingeben|geben sie|anmelden|einloggen|melden sie sich|besuchen|[öo]ffnen|aktualisieren|best[äa]tigen|verifizieren|antworten"),
  pressure: [
    [word("dringend|sofort|umgehend|unverz[üu]glich|schnellstm[öo]glich|eilig"), "urgency"],
    [word("innerhalb (von )?(24|48) stunden|bis heute|noch heute|bis morgen|heute"), "deadline"],
    [stem("gesperrt|sperrung|sperre|strafe|bu[ßs]geld|s[äa]umniszuschlag|mahn|rechtliche schritte|inkasso|pf[äa]ndung"), "penalty"],
    [word("gutschein(karte)?|geschenkkarten?|[üu]berweisung|krypto(w[äa]hrung)?|bitcoin|paysafecard"), "odd_payment"],
    [word("rufen sie nicht an|nicht weitersagen|vertraulich|unter uns|unter vier augen"), "secrecy"],
  ],
  org: word("steuerberater(in)?|steuerberatung|steuerkanzlei|kanzlei|buchhaltung|buchf[üu]hrung|rechtsanw[äa]lte?|anwaltskanzlei|notar|praxis|klinik|bank|sparkasse|volksbank|versicherung|treuhand|wirtschaftspr[üu]fer|gmbh|ag|kg|ug|e\\.\\s?v\\.|partg|mbb"),
  intro: intro(["hier ist", "hier spricht", "im auftrag von", "im auftrag der", "im namen von", "im namen der", "ihre"]),
  anywhere: anywhere(["Steuerkanzlei", "Kanzlei", "Steuerberatung", "Praxis", "Klinik", "Sparkasse", "Volksbank"], ["GmbH", "AG", "KG", "UG", "PartG", "mbB", "Steuerberatung", "Steuerberater"]),
};

const PT: Pack = {
  items: [
    [word("n[úu]mero do seguro social|seguro social"), "ssn"],
    [word("(n[úu]mero da )?seguran[çc]a social"), "social_insurance"],
    [acro("NISS|NIS|PIS(/PASEP)?|NIT"), "social_insurance"],
    [word("carteira de identidade|cart[ãa]o de cidad[ãa]o|bilhete de identidade|documento de identifica[çc][ãa]o"), "national_id"],
    [acro("RG"), "national_id"],
    [word("n[úu]mero de contribuinte|n[úu]mero fiscal|n[úu]mero de identifica[çc][ãa]o fiscal"), "tax_id"],
    [acro("CPF|NIF|CNPJ"), "tax_id"],
    [word("passaportes?"), "passport"],
    [word("documento com foto|carteira de motorista|carta de condu[çc][ãa]o|documento de identidade"), "photo_id"],
    [acro("CNH"), "photo_id"],
    [word("extratos? banc[áa]rios?|extratos? da conta"), "bank_statement"],
    [word("dados banc[áa]rios|n[úu]mero da conta|conta banc[áa]ria|ag[êe]ncia e conta|chave pix"), "bank_account"],
    [acro("IBAN|NIB"), "bank_account"],
    [word("declara[çc][ãa]o (de|do) (imposto de renda|irs|ir)|imposto de renda|recibo da declara[çc][ãa]o"), "tax_return"],
    [word("holerites?|contracheques?|recibos? de (vencimento|sal[áa]rio|pagamento)|comprovantes? de renda"), "pay_stub"],
    [word("data de nascimento"), "dob"],
    [word("prontu[áa]rio|hist[óo]rico m[ée]dico|regist(r)?os? m[ée]dicos?|cart[ãa]o (do sus|de utente|de sa[úu]de)|carteirinha do plano"), "medical"],
  ],
  ask: word("envie|enviar|mande|mandar|anexe|anexar|carregue|carregar|fa[çc]a (o )?upload|forne[çc]a|fornecer|submeta|encaminhe|encaminhar|partilhe|compartilhe|digitalize|responda com|precisamos"),
  creds: [
    [word("senhas?|palavras?-passe"), "password"],
    [word("c[óo]digo (de )?(verifica[çc][ãa]o|seguran[çc]a|acesso|confirma[çc][ãa]o|autentica[çc][ãa]o)|c[óo]digo de [46] d[íi]gitos|token"), "login_code"],
    [word("(verifique|verificar|confirme|confirmar|valide|validar|desbloqueie|desbloquear|reative|reativar|restaure|restaurar) (a sua |sua |seu |o seu )?(conta|identidade|acesso|caixa de correio|e-mail|credenciais|cadastro)"), "account_verification"],
    [word("dados (do cart[ãa]o|de pagamento|de cobran[çc]a)|atualize (seu |o seu )?(pagamento|m[ée]todo de pagamento)"), "payment_details"],
  ],
  credAction: word("clique|toque|digite|insira|introduza|fa[çc]a login|inicie sess[ãa]o|acesse|aceda|visite|abra|atualize|confirme|verifique|responda"),
  pressure: [
    [word("urgente(mente)?|imediatamente|o quanto antes|o mais r[áa]pido poss[íi]vel|com urg[êe]ncia"), "urgency"],
    [word("(em|dentro de) (24|48) horas|at[ée] hoje|ainda hoje|hoje|at[ée] amanh[ãa]"), "deadline"],
    [stem("suspens|bloquead|bloqueio|multa|penalidade|coima|a[çc][ãa]o judicial|cancelad"), "penalty"],
    [word("cart(ão|ões|ao|oes) (de )?presente|vale-presente|gift card|transfer[êe]ncia|cripto(moedas?)?|bitcoin"), "odd_payment"],
    [word("n[ãa]o ligue|n[ãa]o conte|confidencial|sigilo|entre n[óo]s"), "secrecy"],
  ],
  org: word("contabilidade|contabilista|contador(es)?|escrit[óo]rio|advogados|advocacia|consultoria|assessoria|cl[íi]nica|banco|seguros|imobili[áa]ria|ltda|lda|s\\.?a\\.?|eireli"),
  intro: intro(["aqui é", "aqui fala", "em nome da", "em nome do", "em nome de", "da parte da", "da parte do", "da parte de", "somos a", "somos o"]),
  anywhere: anywhere(["Contabilidade", "Escrit[óo]rio", "Assessoria", "Consultoria", "Cl[íi]nica", "Banco"], ["Contabilidade", "Advogados", "Ltda\\.?", "Lda\\.?", "S\\.?A\\.?"]),
};

const PACKS: Record<Locale, Pack> = { en: EN, es: ES, fr: FR, de: DE, pt: PT };
const ALL = Object.values(PACKS);

export interface ExtractedRequest {
  isDocumentRequest: boolean;
  score: number;
  requestedItems: RequestItem[];
  claimedOrg: string;
  senderEmail: string;
  senderDomain: string;
  emails: string[];
  linkDomains: string[];
  phones: string[];
  pressureSignals: PressureSignal[];
  credentialAsks: CredentialAsk[];
  isCredentialRequest: boolean;
  language: Locale | null;
}

const unique = <T>(items: T[]) => [...new Set(items)];

export const normalizePhone = (phone: string) => phone.replace(/\D/g, "").slice(-10);

const PHONE = /(?<![\w/=.-])(?:\+?1[\s.-])?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}(?![\w/])/g;

export const findPhones = (text: string) => unique((text.match(PHONE) ?? []).map((p) => p.trim()));

export function stripMarkup(markdown: string): string {
  return markdown
    .replace(/\(\/cdn-cgi\/[^)]*\)/g, "")
    .replace(/\[*email[\s ]protected\]*/gi, "[email hidden by site]")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_>`|]+/g, " ")
    .replace(/[ \t]+/g, " ");
}

export function packsFor(language: Locale | null): Pack[] {
  if (!language) return ALL;
  return language === "en" ? [EN] : [EN, PACKS[language]];
}

function guessOrg(text: string, displayName: string, packs: Pack[]): string {
  const isOrg = (s: string) => packs.some((p) => p.org.test(s));
  const cleanName = displayName.replace(/["<>]/g, "").trim();
  if (cleanName && isOrg(cleanName)) return cleanName;
  for (const p of packs) {
    for (const m of text.matchAll(p.intro)) {
      const name = (m[1] ?? "").replace(/\.\s.*$/s, "").trim();
      if (name && isOrg(name)) return name;
    }
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(-8).reverse()) {
    if (line.length < 60 && isOrg(line) && /^[\p{Lu}0-9]/u.test(line) && !/@|https?:/.test(line)) return line.replace(/[,.]$/, "");
  }
  for (const p of packs) {
    const found = text.match(p.anywhere)?.[1]?.trim();
    if (found) return found;
  }
  return cleanName;
}

export function extractRequest(body: string, from = "", language?: Locale | null): ExtractedRequest {
  const text = `${body}`;
  const plain = text.replace(/[’‘]/g, "'");
  const lang = language === undefined ? detectLanguage(text).lang : language;
  const packs = packsFor(lang);
  const fromEmail = from.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0]?.toLowerCase() ?? "";
  const displayName = from.replace(/<.*>/, "").replace(fromEmail, "").trim();
  const emails = unique((text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? []).map((e) => e.toLowerCase()));
  const senderEmail = fromEmail || emails[0] || "";
  const urls = text.match(/\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[^\s<>"')\]]+/gi) ?? [];
  const linkDomains = unique(
    urls
      .map((u) => {
        try {
          return registrableDomain(new URL(u.startsWith("http") ? u : `https://${u}`).hostname);
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
  const phones = findPhones(text);
  const hits = <T>(list: (p: Pack) => [RegExp, T][]) => unique(packs.flatMap((p) => list(p).filter(([re]) => re.test(plain)).map(([, code]) => code)));
  const requestedItems = hits((p) => p.items);
  const pressureSignals = hits((p) => p.pressure);
  const credentialAsks = hits((p) => p.creds);
  const asks = packs.some((p) => p.ask.test(plain));
  const credAction = packs.some((p) => p.credAction.test(plain));
  const isCredentialRequest = credentialAsks.length > 0 && (asks || credAction) && (urls.length > 0 || pressureSignals.length > 0 || credentialAsks.length > 1);
  const score = requestedItems.length * 2 + (asks ? 2 : 0) + (pressureSignals.length ? 1 : 0) + credentialAsks.length * 2;
  return {
    credentialAsks,
    isCredentialRequest,
    isDocumentRequest: requestedItems.length > 0 && (asks || requestedItems.length > 1),
    score,
    requestedItems,
    claimedOrg: guessOrg(text, displayName, packs),
    senderEmail,
    senderDomain: senderEmail ? registrableDomain(senderEmail.split("@")[1] ?? "") : "",
    emails,
    linkDomains,
    phones,
    pressureSignals,
    language: lang,
  };
}

export const toCheckRequest = (x: ExtractedRequest, locationHint?: string): CheckRequest => ({
  claimedOrg: x.claimedOrg,
  senderEmail: x.senderEmail || undefined,
  senderDomain: x.senderDomain,
  linkDomains: x.linkDomains,
  phones: x.phones,
  locationHint,
});
