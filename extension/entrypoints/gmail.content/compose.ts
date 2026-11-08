import type { ContentScriptContext } from "#imports";
import { APP_URL } from "@/lib/api";
import { send, type TabMessage, type ThreadFlag, type VaultResult } from "@/lib/messages";

const EDITOR = 'div[contenteditable="true"][role="textbox"], div[g_editable="true"]';
const EMAIL = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function composeRoot(toolbar: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = toolbar;
  while (el && !el.querySelector(EDITOR)) el = el.parentElement;
  return el;
}

function recipients(root: HTMLElement): string[] {
  const out = new Set<string>();
  const outside = (el: Element) => !el.closest(".adn, .gs, .h7");
  root.querySelectorAll("[email]").forEach((el) => outside(el) && out.add(el.getAttribute("email") ?? ""));
  root.querySelectorAll("[data-hovercard-id]").forEach((el) => outside(el) && out.add(el.getAttribute("data-hovercard-id") ?? ""));
  root.querySelectorAll<HTMLInputElement>('input[name="to"], textarea[name="to"], input[name="cc"]').forEach((i) =>
    i.value.split(/[,;\s]+/).forEach((v) => out.add(v.replace(/^.*<|>.*$/g, ""))),
  );
  return [...out].map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e));
}

function until(iso: string) {
  const d = new Date(iso);
  return d.getTime() - Date.now() < 86_400_000
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function linkHtml(r: VaultResult) {
  const who = r.mode === "office" ? `Only ${esc(r.officeName ?? "your office")} can open it.` : "I'll send you the 6-digit code separately.";
  return `<div>🔒 <a href="${esc(r.url)}">Sealed document: ${esc(r.name)}</a> · ${who} Self-destructs ${esc(until(r.expiresAt))}. <span style="color:#5f6368">(Post-quantum sealed with Avaran)</span></div>`;
}

function insert(editor: HTMLElement, saved: Range | null, results: VaultResult[]) {
  const safe = results.filter((r) => r.url.startsWith(`${APP_URL}/`));
  if (!safe.length) return;
  editor.focus();
  const sel = window.getSelection();
  let range = saved && editor.contains(saved.startContainer) ? saved : null;
  if (!range) {
    range = document.createRange();
    range.setStart(editor, 0);
    range.collapse(true);
  }
  sel?.removeAllRanges();
  sel?.addRange(range);
  const html = `${safe.map(linkHtml).join("")}<div><br></div>`;
  let inserted = false;
  try {
    inserted = document.execCommand("insertHTML", false, html);
  } catch {
    inserted = false;
  }
  if (!inserted) range.insertNode(linkNodes(safe));
  editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function linkNodes(results: VaultResult[]) {
  const frag = document.createDocumentFragment();
  for (const r of results) {
    const who = r.mode === "office" ? `Only ${r.officeName ?? "your office"} can open it.` : "I'll send you the 6-digit code separately.";
    const note = el("span", {}, "(Post-quantum sealed with Avaran)");
    note.style.color = "#5f6368";
    frag.append(el("div", {}, "🔒 ", el("a", { href: r.url }, `Sealed document: ${r.name}`), ` · ${who} Self-destructs ${until(r.expiresAt)}. `, note));
  }
  frag.append(el("div", {}, el("br")));
  return frag;
}

const BUTTON_CSS = `
.b{display:inline-flex;align-items:center;gap:6px;font:500 13.5px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fffdf8;color:#2b3666;border:1px solid #bcc3e0;border-radius:18px;padding:9px 14px;cursor:pointer;white-space:nowrap;margin-left:8px}
.b:hover{background:#eef0f7;border-color:#95a0cc}
.b svg{width:14px;height:14px}`;

const VAULT_CSS = `
.bd{position:fixed;inset:0;background:rgba(30,27,23,.45);display:flex;align-items:center;justify-content:center;padding:16px;z-index:2147483646}
.p{width:min(560px,100%);height:min(700px,calc(100vh - 32px));border-radius:14px;overflow:hidden;border:1px solid #e2d9c9;background:#f6f2ea;box-shadow:0 24px 60px rgba(30,27,23,.28)}
iframe{width:100%;height:100%;border:0;display:block;background:#f6f2ea}`;

function lockIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" })) svg.setAttribute(k, v);
  const rect = document.createElementNS(ns, "rect");
  for (const [k, v] of Object.entries({ x: "5", y: "11", width: "14", height: "9", rx: "2" })) rect.setAttribute(k, v);
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M8 11V8a4 4 0 0 1 8 0v3");
  svg.append(rect, path);
  return svg;
}

function openVault(ctx: ContentScriptContext, recipientsList: string[], flag: ThreadFlag | undefined, onResults: (r: VaultResult[]) => void) {
  const nonce = crypto.randomUUID();
  const host = document.createElement("oj-vault");
  const shadow = host.attachShadow({ mode: "closed" });
  const frame = el("iframe", { title: "Avaran vault" });
  frame.setAttribute("allow", "");
  const backdrop = el("div", { className: "bd" }, el("div", { className: "p" }, frame));
  shadow.append(el("style", { textContent: VAULT_CSS }), backdrop);
  const close = () => {
    browser.runtime.onMessage.removeListener(listener);
    document.removeEventListener("keydown", onKey, true);
    host.remove();
  };
  const listener = (message: TabMessage) => {
    if (!message || !("nonce" in message) || message.nonce !== nonce) return;
    if (message.type === "vault:result") onResults(message.results);
    if (message.type === "vault:close") close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  backdrop.addEventListener("click", (e) => e.target === e.currentTarget && close());
  browser.runtime.onMessage.addListener(listener);
  document.addEventListener("keydown", onKey, true);
  ctx.onInvalidated(close);
  send({ type: "vault:open", nonce, context: { recipients: recipientsList, flag } })
    .then(() => {
      frame.src = `${browser.runtime.getURL("/vault.html")}#${nonce}`;
      document.documentElement.append(host);
    })
    .catch(close);
}

export function mountSealButton(ctx: ContentScriptContext, toolbar: HTMLElement, currentFlag: () => ThreadFlag | undefined) {
  if (toolbar.querySelector("oj-seal")) return;
  const host = document.createElement("oj-seal");
  const shadow = host.attachShadow({ mode: "closed" });
  const button = el("button", { className: "b", type: "button", title: "Attach a sealed link instead of a readable file" }, lockIcon(), "Seal & Attach");
  shadow.append(el("style", { textContent: BUTTON_CSS }), button);
  let saved: Range | null = null;
  button.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const sel = window.getSelection();
    saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  });
  button.addEventListener("click", () => {
    const root = composeRoot(toolbar);
    const editor = root?.querySelector<HTMLElement>(EDITOR);
    if (!root || !editor) return;
    if (saved && !editor.contains(saved.startContainer)) saved = null;
    openVault(ctx, recipients(root), currentFlag(), (results) => insert(editor, saved, results));
  });
  const sendCell = toolbar.querySelector("td.gU.Up") ?? toolbar.querySelector("td");
  if (toolbar.tagName === "TR" && sendCell) {
    const td = document.createElement("td");
    td.append(host);
    sendCell.after(td);
  } else if (sendCell) {
    sendCell.after(host);
  } else {
    toolbar.prepend(host);
  }
}
