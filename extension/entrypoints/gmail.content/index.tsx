import { createRoot, type Root } from "react-dom/client";
import type { CheckResponse } from "@oj/core";
import { analyzeLink } from "@oj/core/links";
import { toCheckRequest } from "@oj/core/request";
import type { ContentScriptContext, ShadowRootContentScriptUi } from "#imports";
import { send, type ThreadFlag } from "@/lib/messages";
import { Card } from "./Card";
import { Guard } from "./Guard";
import { mountSealButton } from "./compose";
import { BODY, guardLevel, linkContext, scanMessage, type Scan } from "./scan";
import "./style.css";

interface MessageState {
  scan: Scan;
  result?: CheckResponse;
  ui?: ShadowRootContentScriptUi<Root>;
}

const MARK_CSS = `
a[data-oj-risk="high"]{outline:2px dashed #973d27!important;outline-offset:2px;border-radius:3px}
a[data-oj-risk="high"]::after{content:" \\26A0\\FE0E";color:#973d27;font-weight:700;text-decoration:none}
a[data-oj-risk="medium"]{outline:2px dotted #b5852b!important;outline-offset:2px;border-radius:3px}`;

const checks = new Map<string, Promise<CheckResponse>>();

function checkOnce(scan: Scan) {
  const request = toCheckRequest(scan.request);
  const key = JSON.stringify([request.claimedOrg, request.senderEmail, request.linkDomains, request.phones]);
  let pending = checks.get(key);
  if (!pending) {
    pending = send<CheckResponse>({ type: "check", request });
    pending.catch(() => checks.delete(key));
    checks.set(key, pending);
  }
  return pending;
}

export default defineContentScript({
  matches: ["https://mail.google.com/*"],
  runAt: "document_start",
  cssInjectionMode: "ui",
  async main(ctx: ContentScriptContext) {
    const states = new WeakMap<HTMLElement, MessageState>();
    const bodies = new Set<HTMLElement>();
    let guardUi: ShadowRootContentScriptUi<Root> | null = null;

    function markLinks(body: HTMLElement, state: MessageState) {
      const linkCtx = linkContext(state.result);
      const flagged = state.scan.flagged || state.result?.verdict === "mismatch";
      body.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
        const level = guardLevel(analyzeLink(a.href, (a.innerText || "").trim(), linkCtx), flagged);
        if (level) a.setAttribute("data-oj-risk", level);
        else a.removeAttribute("data-oj-risk");
      });
    }

    async function openGuard(href: string, text: string, state?: MessageState) {
      guardUi?.remove();
      const linkCtx = linkContext(state?.result);
      const check = analyzeLink(href, text, linkCtx);
      const ui = await createShadowRootUi<Root>(ctx, {
        name: "oj-guard",
        position: "modal",
        zIndex: 2147483646,
        isolateEvents: ["keydown", "keyup", "keypress"],
        onMount(container) {
          const root = createRoot(container);
          root.render(<Guard check={check} officialDomain={linkCtx.officialDomain} officialName={linkCtx.officialName} onClose={() => ui.remove()} />);
          return root;
        },
        onRemove: (root) => root?.unmount(),
      });
      guardUi = ui;
      ui.mount();
    }

    function onLinkClick(e: MouseEvent) {
      if (e.button === 2) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const body = a?.closest(BODY) as HTMLElement | null;
      if (!a || !body) return;
      const state = states.get(body);
      const text = (a.innerText || "").trim();
      const check = analyzeLink(a.href, text, linkContext(state?.result));
      const flagged = Boolean(state && (state.scan.flagged || state.result?.verdict === "mismatch"));
      if (!guardLevel(check, flagged)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openGuard(a.href, text, state);
    }

    ctx.addEventListener(window, "click", onLinkClick, { capture: true });
    ctx.addEventListener(window, "auxclick", onLinkClick, { capture: true });

    function currentFlag(): ThreadFlag | undefined {
      for (const body of bodies) {
        const r = body.isConnected ? states.get(body)?.result : undefined;
        if (r?.verdict === "mismatch") {
          return {
            verdict: r.verdict,
            claimedOrg: r.claimedOrg,
            officialDomain: r.officialDomain,
            officialPhone: r.officialPhone,
            officialUploadUrl: r.officialUploadUrl,
            explanation: r.explanation,
          };
        }
      }
      return undefined;
    }

    async function mountCard(body: HTMLElement, state: MessageState) {
      const x = state.scan.request;
      const ui = await createShadowRootUi<Root>(ctx, {
        name: "oj-card",
        position: "inline",
        anchor: body,
        append: "before",
        isolateEvents: ["keydown", "keyup", "keypress"],
        onMount(container) {
          const root = createRoot(container);
          root.render(
            <Card
              scan={state.scan}
              canCheck={x.claimedOrg.trim().length >= 2}
              autoCheck={x.isDocumentRequest || x.isCredentialRequest}
              runCheck={() => checkOnce(state.scan)}
              onResult={(r) => {
                state.result = r;
                markLinks(body, state);
              }}
              onLedger={() => send({ type: "panel:open", tab: "ledger" }).catch(() => {})}
            />,
          );
          return root;
        },
        onRemove: (root) => root?.unmount(),
      });
      state.ui = ui;
      ui.mount();
    }

    function scan() {
      for (const body of bodies) if (!body.isConnected) bodies.delete(body);
      document.querySelectorAll<HTMLElement>(BODY).forEach((body) => {
        const known = states.get(body);
        if (known) {
          if (known.ui && !known.ui.shadowHost.isConnected) {
            known.ui.remove();
            known.ui.mount();
          }
          return;
        }
        if (!body.innerText.trim() || body.closest('[contenteditable="true"]')) return;
        const state: MessageState = { scan: scanMessage(body) };
        states.set(body, state);
        bodies.add(body);
        markLinks(body, state);
        if (state.scan.flagged) mountCard(body, state);
      });
      document.querySelectorAll<HTMLElement>(".btC").forEach((toolbar) => mountSealButton(ctx, toolbar, currentFlag));
    }

    if (!document.body) await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
    const style = document.createElement("style");
    style.textContent = MARK_CSS;
    document.head.append(style);

    let timer = 0;
    const observer = new MutationObserver(() => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        scan();
      }, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    ctx.onInvalidated(() => {
      observer.disconnect();
      style.remove();
    });
    scan();
  },
});
