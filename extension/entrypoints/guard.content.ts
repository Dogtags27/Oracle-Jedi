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

interface Flag {
  label: string;
  url: string;
  verdict: Verdict;
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

const STOP = "If you click, Avaran stops it and asks you first.";
const COPY: Record<FlagKind, { title: string; why: string; rel: string; foot: string }> = {
  dismiss: { title: "A fake way out", why: "It looks like it closes or declines, but it is a link to another site.", rel: "Goes to", foot: STOP },
  form: { title: "A fake way out", why: "It looks like a way out, but it submits this form, and anything you typed, to another site.", rel: "Sends to", foot: STOP },
  overlay: { title: "Invisible click trap", why: "This whole highlighted area is one invisible link. A click anywhere inside it would open another site.", rel: "Clicks go to", foot: "Avaran made it click-through, so your clicks reach the page underneath." },
  frame: { title: "Invisible click trap", why: "An invisible page from another site is laid over this area to catch your clicks.", rel: "Clicks go to", foot: "Avaran made it click-through, so your clicks reach the page underneath." },
  decoy: { title: "Decoy download button", why: "One of several download buttons here that lead to different sites. The real file is on this site.", rel: "Goes to", foot: "If you click, Avaran asks before you leave." },
  mismatch: { title: "The link text lies", why: "The words show one address, but the link goes somewhere else.", rel: "Goes to", foot: STOP },
  extra: { title: "Opens a second site too", why: "The link itself is fine, but its click code also opens another site in a new tab.", rel: "Also opens", foot: "If you click, Avaran lets the link work and blocks the second site." },
  lookalike: { title: "Look-alike address", why: "The address uses characters that imitate another site's name.", rel: "Goes to", foot: "Check the address before you continue." },
  doc: { title: "Hidden document link", why: "It opens a document packed inside the link instead of a website.", rel: "Opens", foot: STOP },
  learned: { title: "Caught on the last click", why: "When this was clicked, it tried to send you to another site. Avaran stopped it.", rel: "Tried to open", foot: "Avaran will keep stopping it on this page." },
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

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

    async function log(kind: string, url: string, label: string, reason: string) {
      blocked++;
      try {
        const current = ((await browser.storage.local.get(LOG_KEY))[LOG_KEY] as unknown[] | undefined) ?? [];
        const entry = { at: new Date().toISOString(), page: location.hostname, kind, label: label.slice(0, 60), dest: url ? siteOf(url) : "", url: url.slice(0, 200), reason };
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
      const says = t.big ? "nothing, it is invisible" : t.flag.label ? `“${t.flag.label.length > 40 ? `${t.flag.label.slice(0, 39)}…` : t.flag.label}”` : "(no text)";
      const dest = /^https?:/i.test(url) ? el("span", { className: "v mono" }, ...hostParts(url)) : el("span", { className: "v" }, url ? "a hidden document" : "another site");
      const hl = el("div", { className: `hl ${level}${t.big ? " big" : ""}` }, el("span", { className: "tag" }, t.big ? "Invisible link: this whole area" : "Real click area"));
      const card = el(
        "div",
        { className: `near ${level}` },
        el("div", { className: "eyebrow" }, "Avaran · before you click"),
        el("div", { className: "title" }, copy.title),
        el("div", { className: "rows" }, el("span", { className: "k" }, "Says"), el("span", { className: "v" }, says), el("span", { className: "k" }, copy.rel), dest),
        el("div", { className: "why" }, copy.why),
        el("div", { className: "foot" }, copy.foot),
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

    function showModal(opts: { url: string; label: string; reason: string; level: "high" | "medium"; proceed: () => void }) {
      if (modalUp) return;
      modalUp = true;
      hideNear();
      ensureHost();
      let confirming = false;
      const close = () => {
        modalUp = false;
        modalBox.replaceChildren();
      };
      const stay = el("button", { className: "go", onclick: close }, "Stay on this page");
      const anyway = el("button", { className: "quiet" }, "Go there anyway");
      anyway.onclick = () => {
        if (opts.level === "high" && !confirming) {
          confirming = true;
          anyway.className = "danger";
          anyway.textContent = `Yes, go to ${siteOf(opts.url)}`;
          return;
        }
        close();
        opts.proceed();
      };
      const back = el(
        "div",
        { className: "back" },
        el(
          "div",
          { className: `modal ${opts.level}` },
          el("div", { className: "title" }, opts.level === "high" ? "Stop: that's not where this button should go" : "Check before you go"),
          opts.label ? el("div", { className: "label" }, `You clicked “${opts.label.slice(0, 60)}”. It would take you to`) : el("div", { className: "label" }, "It would take you to"),
          destLine(opts.url),
          el("div", { className: "url" }, opts.url.slice(0, 160)),
          el("div", { className: "why" }, `⚑ ${opts.reason}`),
          el("div", { className: "acts" }, stay, anyway),
          el("div", { className: "foot" }, "Checked on this device by Avaran Click Guard. Nothing was sent anywhere."),
        ),
      );
      back.addEventListener("click", (e) => e.target === back && close());
      back.addEventListener("keydown", (e) => e.key === "Escape" && close());
      modalBox.replaceChildren(back);
      stay.focus();
    }

    function showToast(title: string, reason: string, url: string, openable: boolean) {
      ensureHost();
      const box = el(
        "div",
        { className: "toast" },
        el("div", { className: "row" }, el("span", { className: "dot" }), el("b", {}, title)),
        el("div", { className: "why" }, reason),
        el(
          "div",
          { className: "acts" },
          ...(openable && url ? [el("button", { className: "quiet", onclick: () => (window.open(url, "_blank", "noopener,noreferrer"), toastBox.replaceChildren()) }, `Open ${siteOf(url)} anyway`)] : []),
          el("button", { onclick: () => toastBox.replaceChildren() }, "OK"),
        ),
      );
      toastBox.replaceChildren(box);
      setTimeout(() => box.isConnected && toastBox.replaceChildren(), 12000);
    }

    function renderPill() {
      const items = [...flags.entries()].filter(([node]) => node.isConnected);
      if (!items.length && !blocked) {
        pillBox.replaceChildren();
        return;
      }
      ensureHost();
      const n = items.length;
      const summary = [n ? `${n} deceptive ${n === 1 ? "button" : "buttons"} on this page` : "", blocked ? `${blocked} blocked` : ""].filter(Boolean).join(" · ");
      const box = el(
        "div",
        { className: "pill" },
        el(
          "div",
          { className: "row" },
          el("span", { className: "dot" }),
          el("span", {}, el("b", {}, "Click Guard"), el("span", { className: "dim" }, ` · ${summary}`)),
          ...(n ? [el("button", { onclick: () => ((open = !open), renderPill()) }, open ? "Hide" : "Show where they go")] : []),
          el("button", { className: "quiet", title: "Hide for this page", onclick: () => pillBox.replaceChildren() }, "✕"),
        ),
      );
      if (open && n) {
        const list = el("div", { className: "list" });
        for (const [node, f] of items.slice(0, 12)) {
          list.append(
            el(
              "div",
              { className: `item ${f.verdict.level}` },
              el("div", { className: "row" }, el("b", {}, `“${(f.label || "(no label)").slice(0, 40)}”`), el("span", { className: "dim" }, "→"), el("span", { className: "mono" }, f.url ? siteOf(f.url) : "unknown")),
              el("div", { className: "why" }, f.verdict.reason),
              el(
                "button",
                {
                  className: "quiet",
                  onclick: () => {
                    node.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                    node.setAttribute("data-oj-click-flash", "");
                    setTimeout(() => node.removeAttribute("data-oj-click-flash"), 1600);
                  },
                },
                "Find it",
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
        let verdict = judgeElement({ label: it.label, hints: hintsOf(it.node), href: it.href, handlerUrls, overlay }, page);
        const decoy = verdict.level === "none" && decoys.has(i);
        if (decoy) verdict = { block: false, level: "medium", kind: "decoy", reason: `One of several “Download” buttons here that lead to different sites. This one goes to ${siteOf(it.href!)}, not this site` };
        if (verdict.level === "none") return;
        let kind = verdict.kind ?? "mismatch";
        const url = kind === "extra" ? (foreign ?? "") : crossSite ? it.href! : (foreign ?? it.href ?? "");
        const btn = it.node as HTMLButtonElement;
        if (kind === "dismiss" && it.node.hasAttribute("formaction") && btn.form && btn.type === "submit") {
          kind = "form";
          verdict = { ...verdict, kind, reason: `“${it.label}” sends this form to ${siteOf(url)}` };
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
          next.set(b, { flag: { label, url: action, kind: "form", verdict: { block: true, level: "high", kind: "form", reason: `“${label}” sends this form to ${siteOf(action)}` }, decoy: false }, overlay: false });
        });
      });
      document.querySelectorAll("iframe").forEach((frame) => {
        const src = resolve(frame.getAttribute("src"));
        if (!src || !/^https?:/i.test(src) || siteOf(src) === pageSite || !shown(frame)) return;
        const r = frame.getBoundingClientRect();
        if (r.width * r.height < 40_000 || opacity(frame) >= 0.15) return;
        next.set(frame, { flag: { label: "", url: src, kind: "frame", verdict: { block: true, level: "high", kind: "frame", reason: `An invisible embedded page from ${siteOf(src)} sits over the content and catches your clicks` }, decoy: false }, overlay: true });
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

    function learn(code: ReasonCode, url: string, reason: string) {
      const p = pressed && performance.now() - pressed.t < 2500 ? pressed : null;
      pressed = null;
      if (!p || code === "plain") return;
      const node = code === "overlay" ? (p.clicky ?? p.hit) : p.clicky;
      if (!node || !node.isConnected || flags.has(node) || node === document.body || node === document.documentElement) return;
      const flag: Flag = { label: labelOf(node), url, verdict: { block: true, level: "high", kind: "learned", reason }, decoy: false, kind: code === "overlay" ? "overlay" : "learned" };
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
      const verdict = judgeElement({ label, hints: hintsOf(a), href: a.href, handlerUrls: [], overlay }, location.href);
      const stop = verdict.block ? verdict : flag?.decoy ? flag.verdict : null;
      if (!stop) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const newTab = a.target === "_blank" || e.ctrlKey || e.metaKey || e.button === 1;
      log("link", a.href, label, stop.reason);
      showModal({
        url: a.href,
        label,
        reason: stop.reason,
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
      const reason = `“${label}” would send this form to ${siteOf(action)}`;
      log("form", action, label, reason);
      showModal({
        url: action,
        label,
        reason,
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
      if (d.kind === "notification") {
        const reason = "This page tells you to click “Allow” so it can send you spam and scam pop-ups. Avaran answered for you: not allowed.";
        log("notification", location.href, "", reason);
        showToast("Blocked a notification trick", reason, "", false);
      } else if (url && d.kind === "popup") {
        const reason = reasonFor(code, label, siteOf(url), from);
        log("popup", url, label, reason);
        showToast("Blocked a hidden pop-up", reason, url, true);
        learn(code, url, reason);
      } else if (url && d.kind === "navigate") {
        const reason = reasonFor(code, label, siteOf(url), from);
        log("redirect", url, label, reason);
        showModal({ url, label, reason, level: "high", proceed: () => location.assign(url) });
        learn(code, url, reason);
      }
      renderPill();
    });

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
      observer.disconnect();
      arm(false);
      host.remove();
      style.remove();
    });
  },
});
