import {
  downloadDecoys,
  gapTo,
  isDismissLabel,
  isSamePageHref,
  judgeElement,
  nearestTrap,
  reasonFor,
  siteOf,
  urlsInHandler,
  type Box,
  type FlagKind,
  type ReasonCode,
  type Verdict,
} from "@oj/core/clicks";
import { clickReason, type ClickMsg } from "@oj/core/findings";
import { systemLocale, translator, type KeyOf, type Locale } from "@oj/core/i18n";
import { getLocale, onLocaleChange } from "@/lib/locale";
import { GUARD } from "@/locales/guard";

const LOG_KEY = "guard:log";
const CANDIDATES = 'a[href], button, [role="button"], input[type="submit"], input[type="button"], input[type="image"], [data-href], [data-url], [data-oj-hint]';
const CLICKY = 'a[href], button, [role="button"], [role="link"], input[type="submit"], input[type="button"], input[type="image"], [data-href], [data-url], [data-oj-hint], [onclick]';
const RADIUS = 56;
const SLACK = 18;
const OVERLAY_QUIET_MS = 6000;

const MARK_CSS = `
[data-oj-click="high"]{outline:2px dashed #973d27!important;outline-offset:2px!important}
[data-oj-click="medium"]{outline:2px dotted #946a1d!important;outline-offset:2px!important}
[data-oj-click-overlay]{pointer-events:none!important;opacity:1!important;background:repeating-linear-gradient(45deg,rgba(151,61,39,.08) 0 14px,transparent 14px 28px)!important;outline:2px dashed #973d27!important;outline-offset:-2px!important}
[data-oj-click-flash]{outline:3px solid #973d27!important;outline-offset:4px!important}`;

const UI_CSS = `
:host{all:initial}
*{box-sizing:border-box}
.ui{font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1e1b17}
.pill{position:fixed;right:16px;bottom:16px;z-index:2147483646;background:#fffdf8;border:1px solid #e2d9c9;border-left:4px solid #973d27;border-radius:10px;padding:8px 10px 8px 12px;
box-shadow:0 10px 30px rgba(30,27,23,.16);max-width:min(460px,calc(100vw - 32px))}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dot{width:8px;height:8px;border-radius:50%;background:#973d27}
b{color:#1e1b17;font-weight:600}.dim{color:#776e62}.mono{font-family:ui-monospace,Consolas,monospace;font-size:13px}
button{font:inherit;font-size:13px;cursor:pointer;border-radius:8px;border:1px solid #cfc3ae;background:#fffdf8;color:#1e1b17;padding:5px 10px}
button:hover{background:#eee8dc}
button.go{background:#2b3666;color:#fffdf8;border-color:#222a4f}
button.go:hover{background:#222a4f}
button.danger{background:#973d27;color:#fffdf8;border-color:#7a311f}
button.quiet{background:transparent;border-color:transparent;color:#776e62}
button.quiet:hover{background:#eee8dc;color:#1e1b17}
.list{margin-top:8px;display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow:auto}
.item{background:#f6f2ea;border:1px solid #e2d9c9;border-radius:8px;padding:7px 10px}
.item.high{border-left:3px solid #973d27}.item.medium{border-left:3px solid #946a1d}
.why{font-size:13px;color:#4b443b;margin-top:3px}
.toast{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(420px,calc(100vw - 32px));background:#fffdf8;border:1px solid #e2d9c9;border-top:4px solid #973d27;border-radius:10px;padding:12px 14px;box-shadow:0 14px 40px rgba(30,27,23,.22)}
.back{position:fixed;inset:0;z-index:2147483647;background:rgba(30,27,23,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.modal{width:min(540px,100%);background:#fffdf8;border:1px solid #e2d9c9;border-top:5px solid #973d27;border-radius:14px;padding:20px 22px;box-shadow:0 24px 60px rgba(30,27,23,.28)}
.modal.medium{border-top-color:#946a1d}
.title{font-family:Georgia,"Times New Roman",serif;font-size:19px;font-weight:600;color:#1e1b17;letter-spacing:-.01em}
.label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#776e62;margin:14px 0 3px}
.dest{font-size:16px;word-break:break-all}.dest b{font-size:18px}
.url{font-size:12px;color:#776e62;word-break:break-all;margin-top:2px}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.foot{margin-top:14px;font-size:12px;color:#776e62;border-top:1px solid #eee8dc;padding-top:10px}
.hl{position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #973d27;border-radius:7px;box-shadow:0 0 0 2px #fffdf8,0 0 0 7px rgba(151,61,39,.30)}
.hl.medium{border-color:#946a1d;box-shadow:0 0 0 2px #fffdf8,0 0 0 7px rgba(148,106,29,.30)}
.hl.big{background:repeating-linear-gradient(45deg,rgba(151,61,39,.34) 0 10px,rgba(151,61,39,.10) 10px 20px)}
.tag{position:absolute;left:-2px;bottom:100%;margin-bottom:5px;background:#973d27;color:#fffdf8;font-size:11px;font-weight:600;line-height:1.2;letter-spacing:.02em;padding:3px 7px;border-radius:5px;white-space:nowrap}
.hl.medium .tag{background:#946a1d}
.tag.in{bottom:auto;top:6px;left:6px;margin:0}
.near{position:fixed;z-index:2147483646;width:min(312px,calc(100vw - 16px));pointer-events:none;background:#fffdf8;border:1px solid #e2d9c9;border-top:4px solid #973d27;border-radius:10px;padding:10px 13px 11px;box-shadow:0 14px 36px rgba(30,27,23,.28)}
.near.medium{border-top-color:#946a1d}
.eyebrow{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#973d27;font-weight:600}
.near.medium .eyebrow{color:#946a1d}
.near .title{font-size:17px;line-height:1.25;margin-top:2px}
.rows{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin-top:9px;padding:7px 10px;background:#f6f2ea;border:1px solid #e2d9c9;border-radius:8px;font-size:13px;align-items:baseline}
.k{color:#776e62;font-size:12px}.v{color:#1e1b17;overflow-wrap:anywhere}.v b{font-weight:700}
.near .why{margin-top:8px}
.near .foot{margin-top:8px;padding-top:7px}
@keyframes oj-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
.near,.hl{animation:oj-in .14s ease-out}
@media (prefers-reduced-motion:reduce){.near,.hl{animation:none}}`;

interface Why {
  reason: string;
  msg?: ClickMsg;
}

type Judged = Verdict & Why;

interface Flag {
  label: string;
  url: string;
  verdict: Judged;
  decoy: boolean;
  kind: FlagKind;
}

interface Target {
  node: Element;
  flag: Flag;
  box: Box;
  big: boolean;
  open: boolean;
}

type Key = KeyOf<typeof GUARD>;

const COPY: Record<FlagKind, { title: Key; why: Key; rel: Key; foot: Key }> = {
  dismiss: { title: "kind.dismiss.title", why: "kind.dismiss.why", rel: "rel.goesTo", foot: "stop" },
  form: { title: "kind.form.title", why: "kind.form.why", rel: "rel.sendsTo", foot: "stop" },
  overlay: { title: "kind.overlay.title", why: "kind.overlay.why", rel: "rel.clicksGoTo", foot: "passThrough" },
  frame: { title: "kind.frame.title", why: "kind.frame.why", rel: "rel.clicksGoTo", foot: "passThrough" },
  decoy: { title: "kind.decoy.title", why: "kind.decoy.why", rel: "rel.goesTo", foot: "kind.decoy.foot" },
  mismatch: { title: "kind.mismatch.title", why: "kind.mismatch.why", rel: "rel.goesTo", foot: "stop" },
  extra: { title: "kind.extra.title", why: "kind.extra.why", rel: "rel.alsoOpens", foot: "kind.extra.foot" },
  lookalike: { title: "kind.lookalike.title", why: "kind.lookalike.why", rel: "rel.goesTo", foot: "kind.lookalike.foot" },
  doc: { title: "kind.doc.title", why: "kind.doc.why", rel: "rel.opens", foot: "stop" },
  learned: { title: "kind.learned.title", why: "kind.learned.why", rel: "rel.triedToOpen", foot: "kind.learned.foot" },
};

const MARKS: Record<Locale, [string, string]> = { en: ["“", "”"], es: ["«", "»"], fr: ["« ", " »"], de: ["„", "“"], pt: ["“", "”"] };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function attrs<T extends Element>(node: T, values: Record<string, string>) {
  for (const [k, v] of Object.entries(values)) node.setAttribute(k, v);
  return node;
}

const dot = () => attrs(el("span", { className: "dot" }), { "aria-hidden": "true" });

function labelOf(node: Element): string {
  const own = node.getAttribute("aria-label") || node.getAttribute("title") || (node as HTMLInputElement).value || "";
  const text = (node as HTMLElement).innerText ?? node.textContent ?? "";
  const alt = node.querySelector("img[alt]")?.getAttribute("alt") ?? "";
  return (own || text || alt).replace(/\s+/g, " ").trim().slice(0, 80);
}

const hintsOf = (node: Element) => {
  const h = node as HTMLElement;
  return `${h.id ?? ""} ${typeof h.className === "string" ? h.className : ""} ${typeof h.parentElement?.className === "string" ? h.parentElement.className : ""}`;
};

function resolve(u: string | null | undefined) {
  if (!u) return undefined;
  try {
    return new URL(u, location.href).href;
  } catch {
    return undefined;
  }
}

function hrefOf(node: Element) {
  if (node instanceof HTMLAnchorElement) return node.href || undefined;
  return resolve(node.getAttribute("formaction") || node.getAttribute("data-href") || node.getAttribute("data-url"));
}

function opacity(node: Element | null) {
  let o = 1;
  for (let n = node, i = 0; n && i < 6; n = n.parentElement, i++) o *= parseFloat(getComputedStyle(n).opacity || "1");
  return o;
}

const topAt = (x: number, y: number) => document.elementsFromPoint(x, y).find((e) => e.localName !== "oj-click-guard") ?? null;

function hitTestable(node: Element, r: Box) {
  const left = Math.max(r.left, 0);
  const top = Math.max(r.top, 0);
  const right = Math.min(r.right, innerWidth);
  const bottom = Math.min(r.bottom, innerHeight);
  if (right - left < 2 || bottom - top < 2) return null;
  const hit = topAt((left + right) / 2, (top + bottom) / 2);
  return Boolean(hit && (hit === node || node.contains(hit)));
}

function isOverlay(node: Element) {
  const r = node.getBoundingClientRect();
  const area = r.width * r.height;
  const share = area / Math.max(1, innerWidth * innerHeight);
  if (node.hasAttribute("data-oj-click-overlay")) return share >= 0.3 || area >= 60_000;
  if (share < 0.3) {
    if (area < 60_000 || opacity(node) >= 0.15 || !/^(absolute|fixed)$/.test(getComputedStyle(node).position)) return false;
    return hitTestable(node, r) === true;
  }
  if (opacity(node) < 0.15) return true;
  const empty = !(node as HTMLElement).innerText?.trim() && !node.querySelector("img, svg, video, canvas, picture");
  return share > 0.5 && empty && getComputedStyle(node).backgroundColor.replace(/\s/g, "") === "rgba(0,0,0,0)";
}

function shown(node: Element) {
  const r = node.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(node);
  return cs.display !== "none" && cs.visibility !== "hidden";
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "runtime",
  runAt: "document_start",
  async main(ctx) {
    const w = window as unknown as Record<string, unknown>;
    if (w.__ojClickGuardUi || !/^https?:$/.test(location.protocol)) return;
    w.__ojClickGuardUi = 1;

    const flags = new Map<Element, Flag>();
    const learned = new Map<Element, Flag>();
    let blocked = 0;
    let open = false;
    let modalUp = false;
    let locale: Locale = systemLocale();
    let tr = translator(GUARD, locale);
    let repaintModal: (() => void) | null = null;
    let repaintToast: (() => void) | null = null;
    const say = (v: Why) => (locale === "en" ? v.reason : clickReason(v, locale));
    const quote = (s: string) => `${MARKS[locale][0]}${s}${MARKS[locale][1]}`;

    const host = document.createElement("oj-click-guard");
    const shadow = host.attachShadow({ mode: "closed" });
    const ui = el("div", { className: "ui" });
    shadow.append(el("style", { textContent: UI_CSS }), ui);
    const nearBox = el("div");
    const pillBox = el("div");
    const toastBox = el("div");
    const modalBox = el("div");
    ui.append(nearBox, pillBox, toastBox, modalBox);
    const ensureHost = () => !host.isConnected && document.documentElement.append(host);

    async function log(kind: string, url: string, label: string, why: Why) {
      blocked++;
      try {
        const current = ((await browser.storage.local.get(LOG_KEY))[LOG_KEY] as unknown[] | undefined) ?? [];
        const entry = { at: new Date().toISOString(), page: location.hostname, kind, label: label.slice(0, 60), dest: url ? siteOf(url) : "", url: url.slice(0, 200), reason: why.reason, ...(why.msg ? { msg: why.msg } : {}) };
        await browser.storage.local.set({ [LOG_KEY]: [entry, ...current].slice(0, 50) });
      } catch {
        return;
      }
    }

    function hostParts(url: string) {
      const site = siteOf(url);
      let hostName = site;
      try {
        hostName = new URL(url).hostname;
      } catch {
        hostName = site;
      }
      const sub = hostName.endsWith(site) ? hostName.slice(0, hostName.length - site.length) : "";
      return [el("span", { className: "dim" }, sub), el("b", {}, site)];
    }

    const destLine = (url: string) => el("div", { className: "dest mono" }, ...hostParts(url));

    let px = -1;
    let py = -1;
    let raf = 0;
    let armed = false;
    let rectsAt = 0;
    let targets: Target[] = [];
    let cur: { t: Target; card: HTMLElement; hl: HTMLElement; w: number; h: number; key: string } | null = null;
    let quiet: Element | null = null;
    let quietTimer = 0;

    const boxKey = (b: Box) => `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`;

    function hideNear() {
      if (!cur) return;
      cur = null;
      clearTimeout(quietTimer);
      nearBox.replaceChildren();
    }

    function placeNear() {
      if (!cur) return;
      const { t, card, hl, w: cw, h: ch } = cur;
      const b = t.box;
      const vw = document.documentElement.clientWidth || innerWidth;
      const vh = innerHeight;
      Object.assign(hl.style, { left: `${b.left - 3}px`, top: `${b.top - 3}px`, width: `${b.right - b.left + 6}px`, height: `${b.bottom - b.top + 6}px` });
      hl.firstElementChild?.classList.toggle("in", b.top < 30 || t.big);
      let left = b.left;
      let top: number;
      if (t.big) {
        left = Math.max(b.left, 0) + 14;
        top = Math.max(b.top, 0) + 38;
      } else if (b.bottom + 12 + ch <= vh - 8) {
        top = b.bottom + 12;
      } else if (b.top - 34 - ch >= 8) {
        top = b.top - 34 - ch;
      } else {
        top = b.top;
        left = b.right + 14 + cw <= vw - 8 ? b.right + 14 : b.left - 14 - cw;
      }
      card.style.left = `${clamp(left, 8, vw - cw - 8)}px`;
      card.style.top = `${clamp(top, 8, vh - ch - 8)}px`;
      cur.key = boxKey(b);
    }

    function showNear(t: Target) {
      if (cur && cur.t.node === t.node) {
        cur.t = t;
        if (cur.key !== boxKey(t.box)) placeNear();
        return;
      }
      hideNear();
      ensureHost();
      const level = t.flag.verdict.level === "high" ? "high" : "medium";
      const copy = COPY[t.flag.kind];
      const url = t.flag.url;
      const says = t.big ? tr("near.invisible") : t.flag.label ? quote(t.flag.label.length > 40 ? `${t.flag.label.slice(0, 39)}…` : t.flag.label) : tr("near.noText");
      const dest = /^https?:/i.test(url) ? el("span", { className: "v mono" }, ...hostParts(url)) : el("span", { className: "v" }, url ? tr("near.hiddenDoc") : tr("near.anotherSite"));
      const hl = attrs(el("div", { className: `hl ${level}${t.big ? " big" : ""}` }, el("span", { className: "tag" }, t.big ? tr("near.tagBig") : tr("near.tag"))), { "aria-hidden": "true" });
      const card = el(
        "div",
        { className: `near ${level}` },
        el("div", { className: "eyebrow" }, tr("near.eyebrow")),
        el("div", { className: "title" }, tr(copy.title)),
        el("div", { className: "rows" }, el("span", { className: "k" }, tr("near.says")), el("span", { className: "v" }, says), el("span", { className: "k" }, tr(copy.rel)), dest),
        el("div", { className: "why" }, tr(copy.why)),
        el("div", { className: "foot" }, tr(copy.foot)),
      );
      card.setAttribute("role", "status");
      nearBox.replaceChildren(hl, card);
      cur = { t, card, hl, w: card.offsetWidth, h: card.offsetHeight, key: "" };
      placeNear();
      if (t.big) {
        quietTimer = window.setTimeout(() => {
          if (cur?.t.node !== t.node) return;
          quiet = t.node;
          hideNear();
        }, OVERLAY_QUIET_MS);
      }
    }

    const isOpen = (t: Pick<Target, "node" | "box" | "big">) => t.big || hitTestable(t.node, t.box) !== false;

    function refreshRects() {
      rectsAt = performance.now();
      for (const t of targets) {
        t.box = t.node.getBoundingClientRect();
        t.open = isOpen(t);
      }
    }

    function fairAt(t: Target) {
      const top = topAt(px, py);
      if (!top) return true;
      if (t.big) return t.node.contains(top) || Boolean(t.node.parentElement?.contains(top));
      if (gapTo(t.box, px, py) === 0) return true;
      const other = top.closest(CLICKY);
      return !other || flags.has(other) || other.contains(t.node) || t.node.contains(other);
    }

    function evaluate() {
      if (modalUp || px < 0 || !targets.length) return hideNear();
      if (quiet) {
        const q = targets.find((t) => t.node === quiet);
        if (!q || gapTo(q.box, px, py) > 0) quiet = null;
      }
      const pool = targets.filter((t) => t.open && t.node !== quiet);
      const keep = cur ? (pool.find((t) => t.node === cur!.t.node) ?? null) : null;
      const pick = nearestTrap(pool, px, py, RADIUS, keep, SLACK);
      if (pick && fairAt(pick)) showNear(pick);
      else hideNear();
    }

    function tick() {
      raf = 0;
      if (performance.now() - rectsAt > 250) refreshRects();
      evaluate();
    }

    const frame = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      px = e.clientX;
      py = e.clientY;
      frame();
    };
    const onShift = () => {
      rectsAt = 0;
      frame();
    };
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget) return;
      px = -1;
      frame();
    };
    const onBlur = () => {
      px = -1;
      frame();
    };

    function arm(on: boolean) {
      if (on === armed) return;
      armed = on;
      if (on) {
        window.addEventListener("pointermove", onMove, { capture: true, passive: true });
        window.addEventListener("pointerout", onOut, { capture: true, passive: true });
        window.addEventListener("scroll", onShift, { capture: true, passive: true });
        window.addEventListener("resize", onShift, { passive: true });
        window.addEventListener("blur", onBlur);
      } else {
        window.removeEventListener("pointermove", onMove, { capture: true });
        window.removeEventListener("pointerout", onOut, { capture: true });
        window.removeEventListener("scroll", onShift, { capture: true });
        window.removeEventListener("resize", onShift);
        window.removeEventListener("blur", onBlur);
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        hideNear();
      }
    }

    function rebuildTargets() {
      targets = [...flags]
        .filter(([node]) => node.isConnected)
        .map(([node, flag]) => ({ node, flag, box: node.getBoundingClientRect() as Box, big: node.hasAttribute("data-oj-click-overlay"), open: true }))
        .filter((t) => t.box.right - t.box.left >= 2 && t.box.bottom - t.box.top >= 2);
      for (const t of targets) t.open = isOpen(t);
      rectsAt = performance.now();
      arm(targets.length > 0);
      if (cur) {
        const same = targets.find((t) => t.node === cur!.t.node);
        if (!same || same.flag !== cur.t.flag) hideNear();
        frame();
      }
    }

    function showModal(opts: { url: string; label: string; why: Why; level: "high" | "medium"; proceed: () => void }) {
      if (modalUp) return;
      modalUp = true;
      hideNear();
      ensureHost();
      const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      let confirming = false;
      const close = () => {
        modalUp = false;
        repaintModal = null;
        modalBox.replaceChildren();
        if (before?.isConnected && before !== document.body) before.focus({ preventScroll: true });
      };
      const title = el("div", { className: "title", id: "oj-cg-title" });
      const lead = el("div", { className: "label", id: "oj-cg-lead" });
      const dest = attrs(destLine(opts.url), { id: "oj-cg-dest" });
      const why = el("div", { className: "why", id: "oj-cg-why" });
      const foot = el("div", { className: "foot" });
      const stay = el("button", { className: "go", onclick: close });
      const anyway = el("button", { className: "quiet" });
      const paint = () => {
        title.textContent = tr(opts.level === "high" ? "modal.high" : "modal.medium");
        lead.textContent = opts.label ? tr("modal.youClicked", { label: quote(opts.label.slice(0, 60)) }) : tr("modal.wouldTake");
        why.replaceChildren(attrs(el("span", {}, "⚑ "), { "aria-hidden": "true" }), say(opts.why));
        stay.textContent = tr("modal.stay");
        stay.title = tr("modal.stayTip");
        anyway.textContent = confirming ? tr("modal.confirm", { site: siteOf(opts.url) }) : tr("modal.anyway");
        anyway.title = tr(confirming ? "modal.confirmTip" : "modal.anywayTip");
        foot.textContent = tr("modal.foot");
      };
      anyway.onclick = () => {
        if (opts.level === "high" && !confirming) {
          confirming = true;
          anyway.className = "danger";
          paint();
          return;
        }
        close();
        opts.proceed();
      };
      const modal = attrs(el("div", { className: `modal ${opts.level}` }, title, lead, dest, el("div", { className: "url" }, opts.url.slice(0, 160)), why, el("div", { className: "acts" }, stay, anyway), foot), {
        role: "alertdialog",
        "aria-modal": "true",
        "aria-labelledby": "oj-cg-title",
        "aria-describedby": "oj-cg-lead oj-cg-dest oj-cg-why",
      });
      const back = el("div", { className: "back" }, modal);
      back.addEventListener("click", (e) => e.target === back && close());
      back.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
          return;
        }
        if (e.key !== "Tab") return;
        const order = [stay, anyway];
        const at = order.indexOf(shadow.activeElement as HTMLButtonElement);
        const next = at < 0 ? (e.shiftKey ? order.length - 1 : 0) : (at + (e.shiftKey ? order.length - 1 : 1)) % order.length;
        e.preventDefault();
        order[next]?.focus();
      });
      paint();
      repaintModal = paint;
      modalBox.replaceChildren(back);
      stay.focus();
    }

    function showToast(kind: "notification" | "popup", why: Why, url: string, openable: boolean) {
      ensureHost();
      const title = el("b");
      const reason = el("div", { className: "why" });
      const dismiss = () => toastBox.replaceChildren();
      const opener = openable && url ? el("button", { className: "quiet", onclick: () => (window.open(url, "_blank", "noopener,noreferrer"), dismiss()) }) : null;
      const ok = el("button", { onclick: dismiss });
      const box = attrs(
        el("div", { className: "toast" }, el("div", { className: "row" }, dot(), title), reason, el("div", { className: "acts" }, ...(opener ? [opener] : []), ok)),
        { role: "alert" },
      );
      const paint = () => {
        title.textContent = tr(kind === "notification" ? "toast.notification" : "toast.popup");
        reason.textContent = say(why);
        ok.textContent = tr("toast.ok");
        if (opener) {
          opener.textContent = tr("toast.openAnyway", { site: siteOf(url) });
          opener.title = tr("toast.openAnywayTip");
        }
      };
      paint();
      repaintToast = () => box.isConnected && paint();
      toastBox.replaceChildren(box);
      setTimeout(() => box.isConnected && dismiss(), 12000);
    }

    function renderPill() {
      const items = [...flags.entries()].filter(([node]) => node.isConnected);
      if (!items.length && !blocked) {
        pillBox.replaceChildren();
        return;
      }
      ensureHost();
      const n = items.length;
      const summary = [n ? tr("pill.deceptive", { count: n }) : "", blocked ? tr("pill.blocked", { count: blocked }) : ""].filter(Boolean).join(" · ");
      const toggle = n ? attrs(el("button", { onclick: () => ((open = !open), renderPill()), ...(open ? {} : { title: tr("pill.showTip") }) }, open ? tr("pill.hide") : tr("pill.show")), { "aria-expanded": String(open) }) : null;
      const box = el(
        "div",
        { className: "pill" },
        el(
          "div",
          { className: "row" },
          dot(),
          el("span", {}, el("b", { title: tr("pill.tip") }, "Click Guard"), el("span", { className: "dim" }, ` · ${summary}`)),
          ...(toggle ? [toggle] : []),
          attrs(el("button", { className: "quiet", title: tr("pill.dismiss"), onclick: () => pillBox.replaceChildren() }, "✕"), { "aria-label": tr("pill.dismiss") }),
        ),
      );
      if (open && n) {
        const list = el("div", { className: "list" });
        for (const [node, f] of items.slice(0, 12)) {
          list.append(
            el(
              "div",
              { className: `item ${f.verdict.level}` },
              el(
                "div",
                { className: "row" },
                el("b", {}, quote((f.label || tr("pill.noLabel")).slice(0, 40))),
                attrs(el("span", { className: "dim" }, "→"), { "aria-hidden": "true" }),
                el("span", { className: "mono" }, f.url ? siteOf(f.url) : tr("pill.unknown")),
              ),
              el("div", { className: "why" }, say(f.verdict)),
              el(
                "button",
                {
                  className: "quiet",
                  title: tr("pill.findTip"),
                  onclick: () => {
                    node.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                    node.setAttribute("data-oj-click-flash", "");
                    setTimeout(() => node.removeAttribute("data-oj-click-flash"), 1600);
                  },
                },
                tr("pill.find"),
              ),
            ),
          );
        }
        box.append(list);
      }
      pillBox.replaceChildren(box);
    }

    function mark(node: Element, flag: Flag, overlay: boolean) {
      const prev = flags.get(node);
      const same = prev && prev.url === flag.url && prev.kind === flag.kind && prev.label === flag.label && prev.verdict.reason === flag.verdict.reason && prev.verdict.level === flag.verdict.level;
      if (!same) flags.set(node, flag);
      if (node.getAttribute("data-oj-click") !== flag.verdict.level) node.setAttribute("data-oj-click", flag.verdict.level);
      if (overlay && !node.hasAttribute("data-oj-click-overlay")) node.setAttribute("data-oj-click-overlay", "");
      else if (!overlay && node.hasAttribute("data-oj-click-overlay")) node.removeAttribute("data-oj-click-overlay");
    }

    function unmark(node: Element) {
      flags.delete(node);
      node.removeAttribute("data-oj-click");
      node.removeAttribute("data-oj-click-overlay");
    }

    function scan() {
      if (!document.body) return;
      const page = location.href;
      const pageSite = siteOf(page);
      const next = new Map<Element, { flag: Flag; overlay: boolean }>();
      const nodes = [...document.querySelectorAll(CANDIDATES)].filter((n) => !n.closest("oj-click-guard")).slice(0, 3000);
      const items = nodes.map((n) => {
        const raw = n.getAttribute("href");
        return { node: n, label: labelOf(n), href: n instanceof HTMLAnchorElement && isSamePageHref(raw) ? undefined : hrefOf(n) };
      });
      const decoys = downloadDecoys(
        items.map((it) => ({ label: it.label, href: it.href ?? (it.node instanceof HTMLAnchorElement ? it.node.href : undefined) })),
        page,
      );
      items.forEach((it, i) => {
        if (learned.has(it.node) || !shown(it.node)) return;
        const handlerUrls = urlsInHandler(
          `${it.node.getAttribute("onclick") ?? ""} ${it.node.getAttribute("data-href") ?? ""} ${it.node.getAttribute("data-url") ?? ""} ${it.node.getAttribute("data-oj-hint") ?? ""}`,
        );
        const hrefSite = it.href && /^https?:/i.test(it.href) ? siteOf(it.href) : null;
        const foreign = handlerUrls.find((u) => siteOf(u) !== pageSite && siteOf(u) !== hrefSite);
        const crossSite = Boolean(hrefSite && hrefSite !== pageSite);
        const overlay = (crossSite || Boolean(foreign)) && isOverlay(it.node);
        let verdict: Judged = judgeElement({ label: it.label, hints: hintsOf(it.node), href: it.href, handlerUrls, overlay }, page);
        const decoy = verdict.level === "none" && decoys.has(i);
        if (decoy) {
          const to = siteOf(it.href!);
          verdict = { block: false, level: "medium", kind: "decoy", reason: `One of several “Download” buttons here that lead to different sites. This one goes to ${to}, not this site`, msg: { key: "decoy", vars: { to } } };
        }
        if (verdict.level === "none") return;
        let kind = verdict.kind ?? "mismatch";
        const url = kind === "extra" ? (foreign ?? "") : crossSite ? it.href! : (foreign ?? it.href ?? "");
        const btn = it.node as HTMLButtonElement;
        if (kind === "dismiss" && it.node.hasAttribute("formaction") && btn.form && btn.type === "submit") {
          kind = "form";
          verdict = { ...verdict, kind, reason: `“${it.label}” sends this form to ${siteOf(url)}`, msg: { key: "form", vars: { label: it.label, to: siteOf(url) } } };
        }
        next.set(it.node, { flag: { label: it.label, url, verdict, decoy, kind }, overlay });
      });
      document.querySelectorAll("form").forEach((form) => {
        const action = resolve(form.getAttribute("action"));
        if (!action || siteOf(action) === pageSite) return;
        form.querySelectorAll('button:not([type="button"]):not([type="reset"]), input[type="submit"]').forEach((b) => {
          if (b.hasAttribute("formaction") || learned.has(b) || next.has(b)) return;
          const label = labelOf(b);
          if (!isDismissLabel(label, hintsOf(b)) || !shown(b)) return;
          const to = siteOf(action);
          next.set(b, { flag: { label, url: action, kind: "form", verdict: { block: true, level: "high", kind: "form", reason: `“${label}” sends this form to ${to}`, msg: { key: "form", vars: { label, to } } }, decoy: false }, overlay: false });
        });
      });
      document.querySelectorAll("iframe").forEach((frame) => {
        const src = resolve(frame.getAttribute("src"));
        if (!src || !/^https?:/i.test(src) || siteOf(src) === pageSite || !shown(frame)) return;
        const r = frame.getBoundingClientRect();
        if (r.width * r.height < 40_000 || opacity(frame) >= 0.15) return;
        const to = siteOf(src);
        next.set(frame, { flag: { label: "", url: src, kind: "frame", verdict: { block: true, level: "high", kind: "frame", reason: `An invisible embedded page from ${to} sits over the content and catches your clicks`, msg: { key: "frame", vars: { to } } }, decoy: false }, overlay: true });
      });
      for (const [node] of learned) if (!node.isConnected) learned.delete(node);
      for (const [node] of flags) if (!node.isConnected || (!next.has(node) && !learned.has(node))) unmark(node);
      for (const [node, { flag, overlay }] of next) mark(node, flag, overlay);
      renderPill();
      rebuildTargets();
    }

    const style = el("style", { textContent: MARK_CSS });
    document.documentElement.append(style);

    let pressed: { hit: Element; clicky: Element | null; t: number } | null = null;
    const remember = (target: EventTarget | null | undefined) => {
      if (!(target instanceof Element) || target.closest("oj-click-guard")) return;
      pressed = { hit: target, clicky: target.closest(CLICKY), t: performance.now() };
    };
    ctx.addEventListener(window, "pointerdown", (e: PointerEvent) => e.isTrusted && remember(e.composedPath()[0]), { capture: true });
    ctx.addEventListener(window, "keydown", (e: KeyboardEvent) => e.isTrusted && (e.key === "Enter" || e.key === " ") && remember(document.activeElement), { capture: true });

    function learn(code: ReasonCode, url: string, why: Why) {
      const p = pressed && performance.now() - pressed.t < 2500 ? pressed : null;
      pressed = null;
      if (!p || code === "plain") return;
      const node = code === "overlay" ? (p.clicky ?? p.hit) : p.clicky;
      if (!node || !node.isConnected || flags.has(node) || node === document.body || node === document.documentElement) return;
      const flag: Flag = { label: labelOf(node), url, verdict: { block: true, level: "high", kind: "learned", reason: why.reason, msg: why.msg }, decoy: false, kind: code === "overlay" ? "overlay" : "learned" };
      learned.set(node, flag);
      mark(node, flag, code === "overlay");
      rebuildTargets();
    }

    ctx.addEventListener(document, "focusin", (e: FocusEvent) => {
      const t = targets.find((x) => x.node === e.target);
      if (t && !modalUp && (e.target as Element).matches(":focus-visible")) showNear({ ...t, box: t.node.getBoundingClientRect(), open: true });
    });
    ctx.addEventListener(document, "focusout", (e: FocusEvent) => {
      if (cur?.t.node === e.target) frame();
    });

    ctx.addEventListener(window, "click", (e: MouseEvent) => {
      if (!e.isTrusted || e.button > 1) return;
      const target = e.composedPath()[0];
      if (!(target instanceof Element) || target.closest("oj-click-guard")) return;
      const a = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!a || (location.hostname === "mail.google.com" && a.closest("div.a3s"))) return;
      const label = labelOf(a);
      const flag = flags.get(a);
      const overlay = /^https?:/i.test(a.href) && siteOf(a.href) !== siteOf(location.href) && isOverlay(a);
      const verdict: Judged = judgeElement({ label, hints: hintsOf(a), href: a.href, handlerUrls: [], overlay }, location.href);
      const stop = verdict.block ? verdict : flag?.decoy ? flag.verdict : null;
      if (!stop) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const newTab = a.target === "_blank" || e.ctrlKey || e.metaKey || e.button === 1;
      log("link", a.href, label, stop);
      showModal({
        url: a.href,
        label,
        why: stop,
        level: stop.level === "high" ? "high" : "medium",
        proceed: () => (newTab ? window.open(a.href, "_blank", "noopener,noreferrer") : location.assign(a.href)),
      });
      renderPill();
    }, { capture: true });

    ctx.addEventListener(window, "submit", (e: Event) => {
      const ev = e as SubmitEvent;
      if (!ev.isTrusted) return;
      const form = ev.target as HTMLFormElement;
      const submitter = ev.submitter;
      const own = submitter?.getAttribute("formaction");
      const action = resolve(own || form.getAttribute("action")) ?? location.href;
      if (siteOf(action) === siteOf(location.href) || !submitter) return;
      const label = labelOf(submitter);
      if (!isDismissLabel(label, hintsOf(submitter))) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const why: Why = { reason: `“${label}” would send this form to ${siteOf(action)}`, msg: { key: "formWould", vars: { label, to: siteOf(action) } } };
      log("form", action, label, why);
      showModal({
        url: action,
        label,
        why,
        level: "high",
        proceed: () => {
          if (own) form.setAttribute("action", action);
          HTMLFormElement.prototype.submit.call(form);
        },
      });
      renderPill();
    }, { capture: true });

    ctx.addEventListener(window, "message", (e: MessageEvent) => {
      if (e.source !== window) return;
      const d = e.data as { __oj_guard?: number; kind?: string; url?: unknown; label?: unknown; code?: unknown; from?: unknown } | null;
      if (!d || d.__oj_guard !== 1) return;
      const url = typeof d.url === "string" && /^https?:/i.test(d.url) ? d.url.slice(0, 2000) : "";
      const label = typeof d.label === "string" ? d.label.slice(0, 80) : "";
      const code: ReasonCode = d.code === "dismiss" || d.code === "overlay" || d.code === "extra" ? d.code : "plain";
      const from = typeof d.from === "string" && /^https?:/i.test(d.from) ? siteOf(d.from) : "";
      const whyFor = (): Why => ({ reason: reasonFor(code, label, siteOf(url), from), msg: { key: code, vars: { label, to: siteOf(url), from } } });
      if (d.kind === "notification") {
        const why: Why = { reason: "This page tells you to click “Allow” so it can send you spam and scam pop-ups. Avaran answered for you: not allowed.", msg: { key: "notification" } };
        log("notification", location.href, "", why);
        showToast("notification", why, "", false);
      } else if (url && d.kind === "popup") {
        const why = whyFor();
        log("popup", url, label, why);
        showToast("popup", why, url, true);
        learn(code, url, why);
      } else if (url && d.kind === "navigate") {
        const why = whyFor();
        log("redirect", url, label, why);
        showModal({ url, label, why, level: "high", proceed: () => location.assign(url) });
        learn(code, url, why);
      }
      renderPill();
    });

    const setLocale = (next: Locale) => {
      if (next === locale) return;
      locale = next;
      tr = translator(GUARD, next);
      renderPill();
      hideNear();
      frame();
      repaintModal?.();
      repaintToast?.();
    };
    getLocale().then(setLocale);
    const offLocale = onLocaleChange(setLocale);

    let timer = 0;
    const schedule = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        scan();
      }, 700);
    };
    const observer = new MutationObserver((records) => {
      if (records.every((r) => r.target === host || (r.target instanceof Element && r.target.closest("oj-click-guard")))) return;
      schedule();
    });
    const start = () => {
      scan();
      if (document.body) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["href", "style", "class", "onclick", "hidden", "open", "data-href", "data-url", "data-oj-hint", "formaction", "action"],
        });
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
    window.addEventListener("load", schedule, { once: true });
    ctx.onInvalidated(() => {
      offLocale();
      observer.disconnect();
      arm(false);
      host.remove();
      style.remove();
    });
  },
});
