import { normName, type Category, type SheatheSettings, type SiteId } from "./sheathe";

export interface Region {
  selector: string;
  detail: string;
}

export interface Adapter {
  id: SiteId;
  name: string;
  match: (host: string) => boolean;
  fine: Record<Category, string[]>;
  pane?: Partial<Record<Category, string[]>>;
  regions: Region[];
  maskTitle: (title: string) => string;
  current: () => string | null;
  item: { label: string; plural: string; container: string };
  markReveals: (allowed: Set<string>, lastN: number) => void;
  enforce: (allowed: Set<string>) => void;
  holes: () => Element[];
}

const REVEAL = "data-oj-reveal";
const text = (el: Element | null | undefined) => normName(el?.getAttribute("title") || el?.textContent);

function clearReveals() {
  document.querySelectorAll(`[${REVEAL}]`).forEach((el) => el.removeAttribute(REVEAL));
}

const ROW = '[role="listitem"], [role="row"], [role="gridcell"]';

function chatRows(): Element[] {
  const pane = document.querySelector("#pane-side");
  if (!pane) return [];
  return [...pane.querySelectorAll(ROW)].filter((el) => {
    const outer = el.parentElement?.closest(ROW);
    return !outer || !pane.contains(outer);
  });
}

function rowNames(row: Element): string[] {
  const names = [...row.querySelectorAll("span[title]")].map((s) => normName(s.getAttribute("title")));
  const first = row.querySelector('span[dir="auto"]');
  if (first) names.push(normName(first.textContent));
  return names.filter(Boolean);
}

const rowAllowed = (row: Element, allowed: Set<string>) => rowNames(row).some((n) => allowed.has(n));

export const whatsapp: Adapter = {
  id: "whatsapp",
  name: "WhatsApp",
  match: (host) => host === "web.whatsapp.com",
  fine: {
    avatars: ["#pane-side img", "#main header img", 'img[src*="pps.whatsapp.net"]', '[data-icon="default-user"]', '[data-icon="default-group"]', "#side header img"],
    names: ["#pane-side span[title]", "#main header span[title]", '#main header span[dir="auto"]', '#main [data-pre-plain-text] span[dir="auto"][aria-label]'],
    previews: ['#pane-side span[dir="ltr"]', '#pane-side span[dir="auto"]:not([title])', '#pane-side [aria-label*="unread" i]', "#pane-side [role=\"gridcell\"] > div > div:last-child"],
    messages: ["#main .copyable-text", "#main [data-pre-plain-text]", '#main [role="row"]', "#main .message-in", "#main .message-out"],
    media: ["#main img:not(header img)", "#main video", "#main canvas", '[data-animate-media-viewer] img', '[aria-label="Media viewer" i] img'],
    input: ['#main footer [contenteditable="true"]', 'footer [contenteditable="true"]'],
  },
  pane: { messages: ["#main > :not(header):not(footer)"] },
  regions: [
    { selector: "#pane-side", detail: ROW },
    { selector: "#main", detail: '[role="row"], .copyable-text, [data-pre-plain-text], .message-in, .message-out' },
  ],
  maskTitle: () => "WhatsApp",
  current: () => text(document.querySelector("#main header span[title]") ?? document.querySelector('#main header span[dir="auto"]')) || null,
  item: { label: "chat", plural: "chats", container: "#main" },
  markReveals(allowed, lastN) {
    clearReveals();
    const open = this.current();
    const main = document.querySelector("#main");
    const openAllowed = Boolean(open && allowed.has(open));
    if (main && openAllowed) main.setAttribute(REVEAL, "chat");
    if (allowed.size) {
      for (const row of chatRows()) if (rowAllowed(row, allowed)) row.setAttribute(REVEAL, "row");
    }
    if (openAllowed) {
      const selected = document.querySelector('#pane-side [aria-selected="true"]');
      const row = selected?.closest('[role="listitem"]') ?? selected?.closest('[role="row"]') ?? selected;
      row?.setAttribute(REVEAL, "row");
    }
    if (main && lastN > 0 && !main.hasAttribute(REVEAL)) {
      const rows = [...main.querySelectorAll('[role="row"]')];
      rows.slice(-lastN).forEach((row) => row.setAttribute(REVEAL, "recent"));
    }
  },
  enforce(allowed) {
    const main = document.querySelector(`#main[${REVEAL}]`);
    if (main) {
      const open = this.current();
      if (!open || !allowed.has(open)) main.removeAttribute(REVEAL);
    }
    document.querySelectorAll(`#pane-side [${REVEAL}="row"]`).forEach((row) => {
      if (rowAllowed(row, allowed)) return;
      if (row.getAttribute("aria-selected") === "true" || row.querySelector('[aria-selected="true"]')) {
        const open = this.current();
        if (open && allowed.has(open)) return;
      }
      row.removeAttribute(REVEAL);
    });
  },
  holes: () => [...document.querySelectorAll(`#main[${REVEAL}="chat"]`)],
};

const visible = (el: Element) => (el as HTMLElement).offsetParent !== null;
const openSubject = () => [...document.querySelectorAll("h2.hP")].find(visible) ?? null;

function threadOf(subject: Element): Element | null {
  let node: Element | null = subject.parentElement;
  while (node && node !== document.body) {
    if (node.querySelector(".a3s, .adn")) return node;
    if (node.matches('div[role="main"]')) return node;
    node = node.parentElement;
  }
  return null;
}

export const gmail: Adapter = {
  id: "gmail",
  name: "Gmail",
  match: (host) => host === "mail.google.com",
  fine: {
    avatars: ["img.ajn", ".aCi img", "[data-hovercard-id] img", 'img[src*="googleusercontent.com"]', 'img[src*="gstatic.com/a/"]'],
    names: ["tr.zA .yX", "tr.zA .yW", ".gD", ".g2", ".go", ".yP", ".zF", "span[email]", "[data-hovercard-id][email]"],
    previews: ["tr.zA .y6", "tr.zA .y2", "tr.zA .bog", "tr.zA .xY.a4W", "h2.hP", "oj-card", ".aKS"],
    messages: [".a3s", ".ii.gt", ".adn .gs .ii"],
    media: [".aQH", ".aZo", ".aQy", ".a3s img"],
    input: ['[contenteditable="true"][role="textbox"]', '[g_editable="true"]', ".aoD", 'input[name="subjectbox"]', "oj-vault"],
  },
  regions: [{ selector: 'div[role="main"]', detail: "tr.zA, .a3s, h2.hP, .adn" }],
  maskTitle: () => "Gmail",
  current: () => {
    const h = openSubject();
    return h ? text(h) || null : null;
  },
  item: { label: "email", plural: "emails", container: 'div[role="main"]' },
  markReveals(allowed) {
    clearReveals();
    if (!allowed.size) return;
    const h = openSubject();
    if (h && allowed.has(text(h))) threadOf(h)?.setAttribute(REVEAL, "email");
    document.querySelectorAll("tr.zA").forEach((row) => {
      if (allowed.has(text(row.querySelector(".bog")))) row.setAttribute(REVEAL, "row");
    });
  },
  enforce(allowed) {
    document.querySelectorAll(`[${REVEAL}="email"]`).forEach((thread) => {
      const h = [...thread.querySelectorAll("h2.hP")].find(visible);
      if (!h || !allowed.has(text(h))) thread.removeAttribute(REVEAL);
    });
    document.querySelectorAll(`tr.zA[${REVEAL}="row"]`).forEach((row) => {
      if (!allowed.has(text(row.querySelector(".bog")))) row.removeAttribute(REVEAL);
    });
  },
  holes: () => [...document.querySelectorAll(`[${REVEAL}="email"]`)],
};

export const ADAPTERS = [whatsapp, gmail];

type Box = [number, number, number, number];

export function veilBoxes(holes: Element[]): Box[] {
  const W = innerWidth || 1;
  const H = innerHeight || 1;
  const hole = holes
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 40 && r.height > 40)
    .sort((a, b) => b.width * b.height - a.width * a.height)[0];
  if (!hole) return [[0, 0, 1, 1]];
  const x = Math.max(0, hole.left / W);
  const y = Math.max(0, hole.top / H);
  const r = Math.min(1, hole.right / W);
  const b = Math.min(1, hole.bottom / H);
  const boxes: Box[] = [
    [0, 0, 1, y],
    [0, b, 1, 1 - b],
    [0, y, x, b - y],
    [r, y, 1 - r, b - y],
  ];
  return boxes.filter((v) => v[2] > 0.002 && v[3] > 0.002).map((v) => v.map((n) => Math.round(n * 10000) / 10000) as Box);
}

const ON = 'html[data-oj-sheathe="on"]:not([data-oj-peek])';
const OPEN = `:not([${REVEAL}]):not([${REVEAL}] *)`;

function selectorsFor(adapter: Adapter, settings: SheatheSettings): string[] {
  const usePane = Boolean(adapter.pane && settings.categories.messages && settings.lastN === 0);
  return (Object.keys(adapter.fine) as Category[])
    .filter((c) => settings.categories[c])
    .flatMap((c) => (usePane && adapter.pane?.[c] ? adapter.pane[c] : adapter.fine[c]));
}

export function compileCss(adapter: Adapter, settings: SheatheSettings): string {
  const px = Math.max(6, Math.min(40, settings.strength));
  const body = `filter: blur(${px}px) saturate(0.4) !important; user-select: none !important;`;
  const selectors = selectorsFor(adapter, settings).map((s) => `${ON} ${s}${OPEN}`);
  const regions = adapter.regions.map((r) => `${ON} ${r.selector}[data-oj-layer="region"]${OPEN}`);
  const full = [`${ON}[data-oj-layer="full"] body > *`, 'html[data-oj-sheathe="on"][data-oj-panic] body > *'];
  return [
    selectors.length ? `${selectors.join(",\n")} { ${body} }` : "",
    `${regions.join(",\n")} { filter: blur(${px + 4}px) saturate(0.3) !important; user-select: none !important; }`,
    `${full.join(",\n")} { filter: blur(${px + 8}px) saturate(0.2) !important; pointer-events: none !important; }`,
  ].join("\n");
}

export function hiddenCount(adapter: Adapter, settings: SheatheSettings): number {
  let n = 0;
  const sel = (Object.keys(adapter.fine) as Category[]).filter((c) => settings.categories[c]).flatMap((c) => adapter.fine[c]);
  for (const s of sel) {
    try {
      document.querySelectorAll(s).forEach((el) => {
        if (!el.closest(`[${REVEAL}]`)) n++;
      });
    } catch {
      continue;
    }
  }
  document.querySelectorAll('[data-oj-layer="region"]').forEach(() => n++);
  return n;
}
