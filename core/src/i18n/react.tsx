import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { COMMON, LOCALES, LOCALE_NAMES, formatters, translator, type Locale, type Messages, type Translator } from "./index";

export type FindingsMode = "content" | "ui";

interface I18nState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  findingsMode: FindingsMode;
  setFindingsMode: (m: FindingsMode) => void;
}

const I18nContext = createContext<I18nState>({
  locale: "en",
  setLocale: () => {},
  findingsMode: "content",
  setFindingsMode: () => {},
});

export function I18nProvider({
  locale,
  setLocale,
  findingsMode = "content",
  setFindingsMode = () => {},
  syncDocument = false,
  children,
}: {
  locale: Locale;
  setLocale: (l: Locale) => void;
  findingsMode?: FindingsMode;
  setFindingsMode?: (m: FindingsMode) => void;
  syncDocument?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    if (syncDocument) document.documentElement.lang = locale;
  }, [locale, syncDocument]);
  const value = useMemo(() => ({ locale, setLocale, findingsMode, setFindingsMode }), [locale, setLocale, findingsMode, setFindingsMode]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useLocale = () => useContext(I18nContext).locale;

export function useT<E extends Record<string, string>>(messages: Messages<E>, override?: Locale | null): Translator<keyof E & string> {
  const locale = useLocale();
  const l = override ?? locale;
  return useMemo(() => translator(messages, l), [messages, l]);
}

export function useFormat(override?: Locale | null) {
  const locale = useLocale();
  const l = override ?? locale;
  return useMemo(() => formatters(l), [l]);
}

export function useContentLocale(detected: Locale | null | undefined) {
  const { locale, findingsMode } = useI18n();
  const [flip, setFlip] = useState(false);
  useEffect(() => setFlip(false), [detected]);
  const wantContent = flip ? findingsMode !== "content" : findingsMode === "content";
  const follows = wantContent && Boolean(detected) && detected !== locale;
  return {
    locale: follows ? (detected as Locale) : locale,
    detected: detected ?? null,
    uiLocale: locale,
    followingContent: follows,
    canSwitch: Boolean(detected) && detected !== locale,
    toggle: () => setFlip((f) => !f),
  };
}

export function LanguageSelect({ className, style, id }: { className?: string; style?: CSSProperties; id?: string }) {
  const { locale, setLocale } = useI18n();
  const t = useT(COMMON);
  return (
    <select
      id={id}
      aria-label={t("language")}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className={className}
      style={style}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l} lang={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}

const BUBBLE: CSSProperties = {
  position: "fixed",
  zIndex: 2147483647,
  maxWidth: 280,
  padding: "6px 10px",
  borderRadius: 7,
  background: "#1e1b17",
  color: "#fffdf8",
  font: '500 12.5px/1.45 "Mukta", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  letterSpacing: "normal",
  textTransform: "none",
  textAlign: "left",
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  boxShadow: "0 6px 20px rgba(30,27,23,0.22)",
  pointerEvents: "none",
};

export function Tip({ text, children, side = "top", delay = 250 }: { text: ReactNode; children: ReactNode; side?: "top" | "bottom"; delay?: number }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const timer = useRef<number>(0);
  const pressed = useRef(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = useCallback((wait: number) => {
    if (pressed.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), wait);
  }, []);
  const hide = useCallback((wait: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setOpen(false);
      setPos(null);
    }, wait);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    if (!open || !bubble.current) return;
    const target = (anchor.current?.firstElementChild as HTMLElement | null) ?? anchor.current;
    if (!target) return;
    const r = target.getBoundingClientRect();
    const b = bubble.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const gap = 8;
    let top = side === "top" ? r.top - b.height - gap : r.bottom + gap;
    if (top < 4) top = r.bottom + gap;
    if (top + b.height > vh - 4) top = Math.max(4, r.top - b.height - gap);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - b.width / 2), Math.max(8, vw - b.width - 8));
    setPos({ top, left });
  }, [open, side, text]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPos(null);
      }
    };
    const onScroll = () => {
      setOpen(false);
      setPos(null);
    };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const child = isValidElement(children) ? cloneElement(children as ReactElement<Record<string, unknown>>, open ? { "aria-describedby": id } : {}) : children;
  const root = anchor.current?.getRootNode();
  const host = root instanceof ShadowRoot ? root : typeof document !== "undefined" ? document.body : null;

  return (
    <span
      ref={anchor}
      style={{ display: "contents" }}
      onMouseOver={() => show(delay)}
      onMouseOut={() => hide(120)}
      onMouseLeave={() => {
        pressed.current = false;
      }}
      onPointerDown={() => {
        pressed.current = true;
        hide(0);
      }}
      onFocus={() => show(0)}
      onBlur={() => {
        pressed.current = false;
        hide(0);
      }}
    >
      {child}
      {open && host
        ? createPortal(
            <span id={id} role="tooltip" ref={bubble} style={{ ...BUBBLE, top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}>
              {text}
            </span>,
            host as Element,
          )
        : null}
    </span>
  );
}

export function TipIcon({ text, label, className, style }: { text: ReactNode; label: string; className?: string; style?: CSSProperties }) {
  return (
    <Tip text={text}>
      <button
        type="button"
        aria-label={label}
        className={className}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: 999,
          border: "1px solid currentColor",
          background: "transparent",
          color: "inherit",
          opacity: 0.6,
          font: "600 10px/1 ui-sans-serif, system-ui, sans-serif",
          cursor: "help",
          padding: 0,
          verticalAlign: "middle",
          ...style,
        }}
      >
        ?
      </button>
    </Tip>
  );
}
