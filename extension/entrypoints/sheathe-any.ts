import { SENSITIVE_KINDS, detect } from "@oj/core/detect";
import type { FindingKind } from "@oj/core";

const KINDS: FindingKind[] = [...SENSITIVE_KINDS, "email", "phone"];
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "OJ-SHEATHE-ANY"]);

const CSS = `
html[data-oj-any="on"] [data-oj-pii] { filter: blur(7px) !important; user-select: none !important; }
html[data-oj-any="on"] [data-oj-pii-img] { filter: blur(10px) saturate(0.3) !important; }
html[data-oj-any="on"] [data-oj-pii-manual] { filter: blur(12px) saturate(0.3) !important; user-select: none !important; }
html[data-oj-any="on"].oj-pick * { cursor: crosshair !important; }`;

const PILL = `
:host{all:initial}
.p{position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;align-items:center;gap:8px;font:500 13px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1e1b17;
background:#fffdf8;border:1px solid #e2d9c9;border-left:4px solid #36437e;border-radius:10px;padding:8px 10px 8px 12px;box-shadow:0 10px 30px rgba(30,27,23,.16)}
.dot{width:8px;height:8px;border-radius:50%;background:#36437e}
b{color:#1e1b17;font-weight:600}.dim{color:#776e62}
button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid #cfc3ae;background:#fffdf8;color:#1e1b17;padding:5px 10px}
button:hover{background:#eee8dc}`;

interface Api {
  toggle: () => void;
}

export default defineUnlistedScript(() => {
  const w = window as unknown as { __ojSheatheAny?: Api };
  if (w.__ojSheatheAny) {
    w.__ojSheatheAny.toggle();
    return;
  }
  const root = document.documentElement;
  const style = Object.assign(document.createElement("style"), { textContent: CSS });
  root.append(style);

  function contextBefore(node: Text, limit = 60) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    walker.currentNode = node;
    let out = "";
    let prev = walker.previousNode() as Text | null;
    while (prev && out.length < limit) {
      out = `${prev.data} ${out}`;
      prev = walker.previousNode() as Text | null;
    }
    return out.replace(/\s+/g, " ").slice(-limit);
  }

  function wrap(node: Text) {
    const parent = node.parentElement;
    if (!parent || SKIP.has(parent.nodeName) || parent.closest("[data-oj-pii],[contenteditable='true'],oj-sheathe-any")) return 0;
    const data = node.data;
    if (data.trim().length < 5 || !/[\d@]/.test(data)) return 0;
    const prefix = contextBefore(node);
    const offset = prefix.length + 1;
    const found = detect(`${prefix} ${data}`, KINDS).filter((f) => f.start >= offset && f.end <= offset + data.length);
    let current = node;
    let consumed = 0;
    for (const f of found) {
      const start = f.start - offset - consumed;
      const piece = current.splitText(start);
      const rest = piece.splitText(f.end - f.start);
      const span = Object.assign(document.createElement("span"), { textContent: piece.data });
      span.setAttribute("data-oj-pii", f.kind);
      piece.replaceWith(span);
      consumed = f.end - offset;
      current = rest;
    }
    return found.length;
  }

  function avatar(img: HTMLImageElement) {
    if (img.hasAttribute("data-oj-pii-img")) return 0;
    const r = img.getBoundingClientRect();
    if (r.width < 16 || r.width > 96 || Math.abs(r.width - r.height) > 4) return 0;
    const radius = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0 : 0);
    if (Math.max(radius(img), radius(img.parentElement)) < r.width * 0.3) return 0;
    img.setAttribute("data-oj-pii-img", "");
    return 1;
  }

  let count = 0;
  function scan(scope: Node) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
    for (const n of nodes) count += wrap(n);
    if (scope instanceof Element || scope instanceof Document) scope.querySelectorAll("img").forEach((img) => (count += avatar(img)));
    render();
  }

  const host = document.createElement("oj-sheathe-any");
  const shadow = host.attachShadow({ mode: "closed" });
  const box = Object.assign(document.createElement("div"), { className: "p" });
  shadow.append(Object.assign(document.createElement("style"), { textContent: PILL }), box);
  function render() {
    const manual = document.querySelectorAll("[data-oj-pii-manual]").length;
    box.replaceChildren();
    const off = Object.assign(document.createElement("button"), { textContent: "Unsheathe", onclick: () => api.toggle() });
    const label = document.createElement("span");
    label.append(Object.assign(document.createElement("b"), { textContent: `${count + manual} items sheathed` }), Object.assign(document.createElement("span"), { className: "dim", textContent: " · Alt+click to hide more" }));
    box.append(Object.assign(document.createElement("span"), { className: "dot" }), label, off);
  }

  const onClick = (e: MouseEvent) => {
    if (!e.altKey || root.getAttribute("data-oj-any") !== "on") return;
    const target = e.target as Element | null;
    if (!target || target.closest("oj-sheathe-any")) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (target.hasAttribute("data-oj-pii-manual")) target.removeAttribute("data-oj-pii-manual");
    else target.setAttribute("data-oj-pii-manual", "");
    render();
  };
  window.addEventListener("click", onClick, true);

  let pending: Node[] = [];
  let timer = 0;
  const observer = new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => n.nodeName !== "OJ-SHEATHE-ANY" && pending.push(n));
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      const batch = pending;
      pending = [];
      if (root.getAttribute("data-oj-any") === "on") batch.forEach((n) => n.isConnected && scan(n));
    }, 300);
  });

  const api: Api = {
    toggle() {
      if (root.getAttribute("data-oj-any") === "on") {
        root.setAttribute("data-oj-any", "off");
        observer.disconnect();
        host.remove();
      } else {
        root.setAttribute("data-oj-any", "on");
        root.append(host);
        scan(document.body);
        observer.observe(document.body, { childList: true, subtree: true });
      }
    },
  };
  w.__ojSheatheAny = api;
  api.toggle();
});
