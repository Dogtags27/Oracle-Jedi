import { BAIT, isSamePageHref, judgeOpen, navTargetInCode, sameSite, type ClickContext } from "@oj/core/clicks";

const CLICKABLE = 'a[href], button, [role="button"], [role="link"], [role="menuitem"], input[type="submit"], input[type="button"], input[type="image"], summary, label, select, [onclick]';

export default defineContentScript({
  matches: ["<all_urls>"],
  registration: "runtime",
  world: "MAIN",
  runAt: "document_start",
  main() {
    const w = window as unknown as Record<string, unknown>;
    if (w.__ojClickGuard) return;
    w.__ojClickGuard = 1;

    const Url = URL;
    const nowMs = () => performance.now();
    const getStyle = window.getComputedStyle.bind(window);
    const post = window.postMessage.bind(window);
    const origin = location.origin;
    const abs = (u: unknown) => {
      try {
        return new Url(String(u ?? ""), location.href).href;
      } catch {
        return "";
      }
    };
    const report = (detail: Record<string, unknown>) => post({ __oj_guard: 1, ...detail }, origin === "null" ? "*" : origin);

    function labelOf(el: Element): string {
      const own = el.getAttribute("aria-label") || el.getAttribute("title") || (el as HTMLInputElement).value || "";
      const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
      const alt = el.querySelector("img[alt]")?.getAttribute("alt") ?? "";
      return (own || text || alt).replace(/\s+/g, " ").trim().slice(0, 80);
    }

    function opacity(el: Element | null) {
      let o = 1;
      for (let n = el, i = 0; n && i < 6; n = n.parentElement, i++) o *= parseFloat(getStyle(n).opacity || "1");
      return o;
    }

    function isOverlay(el: Element) {
      const r = el.getBoundingClientRect();
      const share = (r.width * r.height) / Math.max(1, innerWidth * innerHeight);
      if (share < 0.3) return r.width * r.height >= 60_000 && opacity(el) < 0.15 && /^(absolute|fixed)$/.test(getStyle(el).position);
      if (opacity(el) < 0.15) return true;
      const empty = !(el as HTMLElement).innerText?.trim() && !el.querySelector("img, svg, video, canvas, picture");
      return share > 0.5 && empty && getStyle(el).backgroundColor.replace(/\s/g, "") === "rgba(0,0,0,0)";
    }

    function looksClickable(el: Element | null) {
      for (let n = el, i = 0; n && i < 4; n = n.parentElement, i++) if (getStyle(n).cursor === "pointer") return true;
      return false;
    }

    let last: (ClickContext & { t: number; el: Element | null }) | null = null;

    function record(e: Event) {
      if (!e.isTrusted) return;
      const target = e.composedPath()[0] as Element | null;
      if (!(target instanceof Element) || target.closest("oj-click-guard")) {
        last = null;
        return;
      }
      const clickable = target.closest(CLICKABLE);
      const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
      const subject = clickable ?? target;
      const hintEl = subject as HTMLElement;
      last = {
        t: nowMs(),
        el: anchor ?? clickable,
        label: labelOf(subject),
        hints: `${hintEl.id ?? ""} ${typeof hintEl.className === "string" ? hintEl.className : ""} ${hintEl.parentElement?.className ?? ""}`,
        anchorHref: anchor && !isSamePageHref(anchor.getAttribute("href")) ? anchor.href : undefined,
        looksClickable: Boolean(clickable) || looksClickable(target),
        overlay: isOverlay(anchor ?? clickable ?? target),
      };
    }
    addEventListener("pointerdown", record, true);
    addEventListener("click", record, true);
    addEventListener("keydown", (e) => {
      if (e.isTrusted && (e.key === "Enter" || e.key === " ") && document.activeElement) record({ isTrusted: true, composedPath: () => [document.activeElement] } as unknown as Event);
    }, true);

    const ElementType = Element;
    const fnText = Function.prototype.toString;
    const setAttr = Element.prototype.setAttribute;
    const POINTERISH = /^(click|auxclick|mousedown|mouseup|pointerdown|pointerup)$/;
    const seen = new WeakMap<object, string>();
    let budget = 4000;
    const hint = (target: unknown, fn: unknown) => {
      if (!(target instanceof ElementType) || typeof fn !== "function" || budget <= 0) return;
      let url = seen.get(fn);
      if (url === undefined) {
        budget--;
        try {
          const found = navTargetInCode(fnText.call(fn).slice(0, 8000));
          url = found ? abs(found) : "";
        } catch {
          url = "";
        }
        seen.set(fn, url);
      }
      if (url && /^https?:/i.test(url) && !sameSite(url, location.href)) setAttr.call(target, "data-oj-hint", url.slice(0, 500));
    };
    const addListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
      if (listener && POINTERISH.test(type)) hint(this, listener);
      return addListener.call(this, type, listener, options);
    };
    const onclick = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "onclick");
    if (onclick?.set && onclick.configurable) {
      const setOnclick = onclick.set;
      Object.defineProperty(HTMLElement.prototype, "onclick", {
        ...onclick,
        set(this: HTMLElement, value: unknown) {
          hint(this, value);
          setOnclick.call(this, value);
        },
      });
    }

    const recent = (ms = 1200) => (last && nowMs() - last.t < ms ? last : null);

    const open = window.open;
    window.open = function (this: Window, url?: string | URL, target?: string, features?: string) {
      const dest = abs(url);
      if (/^https?:/i.test(dest)) {
        const c = recent();
        const v = judgeOpen(dest, location.href, c);
        if (v.block) {
          report({ kind: "popup", url: dest, label: c?.label ?? "", code: v.code, from: c?.anchorHref ?? "" });
          return null;
        }
      }
      return open.call(this, url as string, target, features);
    } as typeof window.open;

    function guardAnchor(a: HTMLAnchorElement) {
      const dest = a.href;
      if (!/^https?:/i.test(dest) || sameSite(dest, location.href)) return true;
      const c = recent();
      if (!c || c.el === a) return true;
      const v = judgeOpen(dest, location.href, c);
      if (!v.block) return true;
      report({ kind: a.target === "_blank" ? "popup" : "navigate", url: dest, label: c.label, code: v.code, from: c.anchorHref ?? "" });
      return false;
    }

    const aClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (guardAnchor(this)) aClick.call(this);
    };
    const dispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function (this: EventTarget, event: Event) {
      if (this instanceof HTMLAnchorElement && event.type === "click" && !event.isTrusted && !guardAnchor(this)) return false;
      return dispatch.call(this, event);
    };

    const submit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function (this: HTMLFormElement) {
      const dest = abs(this.action || location.href);
      const c = recent();
      const v = judgeOpen(dest, location.href, c);
      if (v.block) {
        report({ kind: "navigate", url: dest, label: c?.label ?? "", code: v.code, from: c?.anchorHref ?? "" });
        return;
      }
      submit.call(this);
    };

    const nav = (window as unknown as { navigation?: EventTarget }).navigation;
    nav?.addEventListener("navigate", (event: Event) => {
      const e = event as Event & { cancelable: boolean; hashChange: boolean; destination?: { url: string } };
      const dest = e.destination?.url ?? "";
      if (!e.cancelable || e.hashChange || !/^https?:/i.test(dest)) return;
      const c = recent(1500);
      if (!c) return;
      const v = judgeOpen(dest, location.href, c);
      if (!v.block) return;
      e.preventDefault();
      report({ kind: "navigate", url: dest, label: c.label, code: v.code, from: c.anchorHref ?? "" });
    });

    const N = window.Notification as (typeof Notification & { requestPermission: typeof Notification.requestPermission }) | undefined;
    if (N?.requestPermission) {
      const ask = N.requestPermission.bind(N);
      N.requestPermission = function (callback?: NotificationPermissionCallback) {
        const text = (document.body?.innerText ?? "").slice(0, 8000);
        if (BAIT.test(text)) {
          report({ kind: "notification", url: location.href, label: "" });
          callback?.("default");
          return Promise.resolve("default" as NotificationPermission);
        }
        return ask(callback);
      } as typeof Notification.requestPermission;
    }
  },
});
