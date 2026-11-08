import { defineMessages } from "@oj/core/i18n";

export const CHECKLIST = defineMessages(
  {
    "W-2": "W-2",
    "1099-INT": "1099-INT",
    "1099-NEC": "1099-NEC",
    "1098 Mortgage": "1098 Mortgage",
    "Photo ID": "Photo ID",
    "Bank statement": "Bank statement",
    "Pay stub": "Pay stub",
    "Prior-year return": "Prior-year return",
  },
  {
    es: {
      "W-2": "W-2",
      "1099-INT": "1099-INT",
      "1099-NEC": "1099-NEC",
      "1098 Mortgage": "1098 (hipoteca)",
      "Photo ID": "Identificación con foto",
      "Bank statement": "Extracto bancario",
      "Pay stub": "Recibo de nómina",
      "Prior-year return": "Declaración del año anterior",
    },
    fr: {
      "W-2": "W-2",
      "1099-INT": "1099-INT",
      "1099-NEC": "1099-NEC",
      "1098 Mortgage": "1098 (prêt immobilier)",
      "Photo ID": "Pièce d’identité avec photo",
      "Bank statement": "Relevé bancaire",
      "Pay stub": "Bulletin de salaire",
      "Prior-year return": "Déclaration de l’année précédente",
    },
    de: {
      "W-2": "W-2",
      "1099-INT": "1099-INT",
      "1099-NEC": "1099-NEC",
      "1098 Mortgage": "1098 (Hypothek)",
      "Photo ID": "Lichtbildausweis",
      "Bank statement": "Kontoauszug",
      "Pay stub": "Gehaltsabrechnung",
      "Prior-year return": "Steuererklärung des Vorjahres",
    },
    pt: {
      "W-2": "W-2",
      "1099-INT": "1099-INT",
      "1099-NEC": "1099-NEC",
      "1098 Mortgage": "1098 (financiamento imobiliário)",
      "Photo ID": "Documento com foto",
      "Bank statement": "Extrato bancário",
      "Pay stub": "Holerite",
      "Prior-year return": "Declaração do ano anterior",
    },
  },
);

export type ChecklistItem = keyof typeof CHECKLIST.en;

export const isChecklistItem = (item: string): item is ChecklistItem => Object.prototype.hasOwnProperty.call(CHECKLIST.en, item);
