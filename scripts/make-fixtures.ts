import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import puppeteer from "puppeteer-core";

const OUT = resolve("fixtures");
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
mkdirSync(OUT, { recursive: true });

export const FIXTURE_TRUTH = {
  "w2-sample.pdf": ["987-65-4321", "12-3456789"],
  "bank-statement-sample.pdf": ["261073986", "4400 1234 56", "987-65-4322"],
  "id-sample.pdf": ["P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", "L898902C36UTO7408122F1204159ZE184226B<<<<<10", "12 AUG 1974"],
  "intake-notes-sample.txt": ["987-65-4323", "03/14/1988", "4111 1111 1111 1111"],
  "receipt-benign.pdf": [],
};

async function base(title: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor("Sample Generator");
  doc.setProducer("Avaran fixtures");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, font, bold };
}

function watermark(page: PDFPage, font: PDFFont) {
  const { width, height } = page.getSize();
  page.drawText("SAMPLE · NOT A REAL DOCUMENT", { x: width / 2 - 230, y: height / 2 - 120, size: 34, font, color: rgb(0.85, 0.15, 0.2), opacity: 0.18, rotate: degrees(35) });
}

const box = (page: PDFPage, x: number, y: number, w: number, h: number) =>
  page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 0.8 });

function field(page: PDFPage, font: PDFFont, bold: PDFFont, x: number, y: number, w: number, label: string, value: string) {
  box(page, x, y, w, 34);
  page.drawText(label, { x: x + 4, y: y + 23, size: 7, font });
  page.drawText(value, { x: x + 6, y: y + 7, size: 11, font: bold });
}

async function w2() {
  const { doc, font, bold } = await base("Form W-2 Wage and Tax Statement 2025 (SAMPLE)");
  const page = doc.addPage([612, 396]);
  page.drawText("Form W-2  Wage and Tax Statement  2025", { x: 30, y: 362, size: 14, font: bold });
  page.drawText("Copy B, To Be Filed With Employee's FEDERAL Tax Return", { x: 30, y: 348, size: 8, font });
  field(page, font, bold, 30, 300, 200, "a Employee's social security number", "987-65-4321");
  field(page, font, bold, 30, 262, 270, "b Employer identification number (EIN)", "12-3456789");
  field(page, font, bold, 300, 262, 140, "1 Wages, tips, other compensation", "84,200.00");
  field(page, font, bold, 440, 262, 140, "2 Federal income tax withheld", "9,812.40");
  box(page, 30, 196, 270, 66);
  page.drawText("c Employer's name, address, and ZIP code", { x: 34, y: 251, size: 7, font });
  page.drawText("Harbor Point Logistics LLC", { x: 36, y: 236, size: 10, font: bold });
  page.drawText("400 Wharf Row, Suite 12, Boston, MA 02110", { x: 36, y: 222, size: 9, font });
  field(page, font, bold, 300, 228, 140, "3 Social security wages", "84,200.00");
  field(page, font, bold, 440, 228, 140, "4 Social security tax withheld", "5,220.40");
  box(page, 30, 120, 270, 76);
  page.drawText("e Employee's name, address, and ZIP code", { x: 34, y: 185, size: 7, font });
  page.drawText("Jordan Q. Sample", { x: 36, y: 170, size: 10, font: bold });
  page.drawText("88 Elm Court, Apt 3, Cambridge, MA 02139", { x: 36, y: 156, size: 9, font });
  field(page, font, bold, 300, 194, 140, "5 Medicare wages and tips", "84,200.00");
  field(page, font, bold, 440, 194, 140, "6 Medicare tax withheld", "1,220.90");
  field(page, font, bold, 300, 160, 140, "15 State  Employer's state ID no.", "MA 0042-117");
  field(page, font, bold, 440, 160, 140, "16 State wages, tips, etc.", "84,200.00");
  page.drawText("Fictional employee and employer. SSN from the SSA advertising range.", { x: 30, y: 30, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
  watermark(page, bold);
  return doc.save();
}

async function bank() {
  const { doc, font, bold } = await base("Harbor Point Credit Union statement (SAMPLE)");
  const rows1 = [
    ["10/01", "Opening balance", "", "6,412.18"],
    ["10/03", "Payroll deposit HARBOR POINT LOGISTICS", "3,104.22", "9,516.40"],
    ["10/05", "Rent payment ELM COURT PROPERTIES", "-2,450.00", "7,066.40"],
    ["10/09", "Grocery MARKET BASKET #212", "-142.67", "6,923.73"],
    ["10/14", "Transfer to savings", "-500.00", "6,423.73"],
    ["10/17", "Payroll deposit HARBOR POINT LOGISTICS", "3,104.22", "9,527.95"],
  ];
  const p1 = doc.addPage([612, 792]);
  p1.drawText("Harbor Point Credit Union", { x: 40, y: 740, size: 18, font: bold });
  p1.drawText("Monthly statement · October 1 to October 31, 2025", { x: 40, y: 722, size: 10, font });
  p1.drawText("Jordan Q. Sample", { x: 40, y: 690, size: 11, font: bold });
  p1.drawText("88 Elm Court, Apt 3, Cambridge, MA 02139", { x: 40, y: 676, size: 10, font });
  p1.drawText("Member SSN: 987-65-4322", { x: 40, y: 662, size: 10, font });
  p1.drawText("Account number: 4400 1234 56", { x: 360, y: 690, size: 10, font });
  p1.drawText("Routing number: 261073986", { x: 360, y: 676, size: 10, font });
  p1.drawText("Checking · Everyday Plus", { x: 360, y: 662, size: 10, font });
  p1.drawText("Date      Description                                          Amount        Balance", { x: 40, y: 620, size: 9, font: bold });
  rows1.forEach((r, i) => {
    const y = 600 - i * 18;
    p1.drawText(r[0]!, { x: 40, y, size: 9, font });
    p1.drawText(r[1]!, { x: 90, y, size: 9, font });
    p1.drawText(r[2]!, { x: 400, y, size: 9, font });
    p1.drawText(r[3]!, { x: 490, y, size: 9, font });
  });
  p1.drawText("Questions? Call (617) 555-0177. Fictional credit union for demonstrations.", { x: 40, y: 60, size: 8, font });
  watermark(p1, bold);
  const p2 = doc.addPage([612, 792]);
  p2.drawText("Harbor Point Credit Union · page 2 · Account number: 4400 1234 56", { x: 40, y: 740, size: 10, font });
  p2.drawText("Overdraft protection, fees and disclosures", { x: 40, y: 700, size: 12, font: bold });
  ["No monthly maintenance fee was charged this period.", "Overdraft transfers: 0. Returned items: 0.", "Your statement is available online for 7 years."].forEach((t, i) =>
    p2.drawText(t, { x: 40, y: 676 - i * 16, size: 10, font }),
  );
  watermark(p2, bold);
  return doc.save();
}

async function idPage() {
  const { doc, font, bold } = await base("Passport data page (SAMPLE, ICAO specimen)");
  const page = doc.addPage([500, 330]);
  page.drawRectangle({ x: 10, y: 10, width: 480, height: 310, color: rgb(0.93, 0.95, 0.98), borderColor: rgb(0.2, 0.3, 0.5), borderWidth: 1 });
  page.drawText("UTOPIA · PASSPORT (ICAO SPECIMEN)", { x: 30, y: 292, size: 12, font: bold });
  page.drawRectangle({ x: 30, y: 120, width: 110, height: 140, color: rgb(0.8, 0.83, 0.88) });
  page.drawText("PHOTO", { x: 65, y: 185, size: 10, font });
  const lines: [string, string][] = [
    ["Surname", "ERIKSSON"],
    ["Given names", "ANNA MARIA"],
    ["Nationality", "UTOPIAN"],
    ["Date of birth", "12 AUG 1974"],
    ["Passport No.", "L898902C3"],
    ["Date of expiry", "15 APR 2032"],
  ];
  lines.forEach(([k, v], i) => {
    page.drawText(k, { x: 160, y: 258 - i * 24, size: 7, font });
    page.drawText(v, { x: 160, y: 247 - i * 24, size: 11, font: bold });
  });
  page.drawText("P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", { x: 24, y: 58, size: 10.5, font: bold });
  page.drawText("L898902C36UTO7408122F1204159ZE184226B<<<<<10", { x: 24, y: 38, size: 10.5, font: bold });
  watermark(page, bold);
  return doc.save();
}

async function receipt() {
  const { doc, font, bold } = await base("Receipt (benign)");
  const page = doc.addPage([400, 520]);
  page.drawText("Corner Bakery Co-op", { x: 30, y: 480, size: 16, font: bold });
  ["Order #4815162342", "Date 11/02/2025 08:14", "2 x Sourdough loaf   12.00", "1 x Oat latte        5.25", "Subtotal             17.25", "Tax                   1.08", "Total                18.33", "Card ending 1111 · Auth 004211", "Store phone (617) 555-0123", "Zip 02115 · Thank you!"].forEach((t, i) =>
    page.drawText(t, { x: 30, y: 440 - i * 22, size: 11, font }),
  );
  return doc.save();
}

const intake = `[SAMPLE] Tax intake notes, fictional client
Client: Riley Sample
SSN: 987-65-4323
Date of birth: 03/14/1988
Card on file for the prep fee: 4111 1111 1111 1111 (test card)
Prefers email: riley.sample@example.com
Notes: bring 1099-INT from Harbor Point Credit Union.
`;

const cardHtml = `<!doctype html><html><body style="margin:0;background:#e9eef5;font-family:Arial,sans-serif">
<div style="width:640px;height:400px;position:relative;background:linear-gradient(135deg,#dfe8f5,#f6f8fb);border:2px solid #36507a;border-radius:18px;box-sizing:border-box;padding:24px">
<div style="font-weight:bold;color:#22355a;font-size:20px">STATE OF UTOPIA · DRIVER LICENSE</div>
<div style="position:absolute;left:24px;top:70px;width:150px;height:190px;background:#c7cfdb;display:flex;align-items:center;justify-content:center;color:#55657e">PHOTO</div>
<div style="position:absolute;left:200px;top:72px;font-size:15px;line-height:30px;color:#111">
<div><span style="font-size:11px;color:#555">DL NO</span> &nbsp;<b>S123-4567-8901</b></div>
<div><span style="font-size:11px;color:#555">NAME</span> &nbsp;<b>JORDAN Q SAMPLE</b></div>
<div><span style="font-size:11px;color:#555">DOB</span> &nbsp;<b>04/12/1986</b></div>
<div><span style="font-size:11px;color:#555">ADDRESS</span> &nbsp;<b>88 ELM CT APT 3, CAMBRIDGE</b></div>
<div><span style="font-size:11px;color:#555">EXP</span> &nbsp;<b>04/12/2030</b></div></div>
<div style="position:absolute;right:30px;bottom:24px;transform:rotate(-12deg);color:rgba(210,30,50,.35);font-size:42px;font-weight:bold">SAMPLE</div>
</div></body></html>`;

writeFileSync(resolve(OUT, "w2-sample.pdf"), await w2());
writeFileSync(resolve(OUT, "bank-statement-sample.pdf"), await bank());
writeFileSync(resolve(OUT, "id-sample.pdf"), await idPage());
writeFileSync(resolve(OUT, "receipt-benign.pdf"), await receipt());
writeFileSync(resolve(OUT, "intake-notes-sample.txt"), intake);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 400 });
  await page.setContent(cardHtml);
  await page.screenshot({ path: resolve(OUT, "drivers-license-sample.png") as `${string}.png`, clip: { x: 0, y: 0, width: 640, height: 400 } });
} finally {
  await browser.close();
}
writeFileSync(resolve(OUT, "README.md"), `# Demo fixtures (all fictional)

Generated by \`npx tsx scripts/make-fixtures.ts\`. Every person, employer, bank and ID here is invented. SSNs come only from the SSA advertising range (987-65-4320 to 987-65-4329), the card is the standard 4111 test number, and the passport is the ICAO "Utopia" specimen.

| File | Contains | Use it to show |
|---|---|---|
| w2-sample.pdf | SSN, EIN | Seal & Attach → Trim finds and blacks out the SSN |
| bank-statement-sample.pdf | SSN, account and routing numbers, 2 pages | Drop page 2, keep only what they asked for |
| id-sample.pdf | Passport MRZ lines, date of birth | MRZ detection |
| drivers-license-sample.png | A photo-style ID | Draw a box (photos have no text layer); camera metadata stripping |
| intake-notes-sample.txt | SSN, date of birth, test card number | Text redaction |
| receipt-benign.pdf | Order number, phone, card's last 4 | No false alarms |
`);
console.log("fixtures written to", OUT);
