import type { MouseEvent, ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { LanguageSelect, Tip, useT } from "@oj/core/i18n/react";
import { Icon, Mark } from "./ui";
import { LAYOUT } from "../locales/layout";

const NAV = [
  ["/check", "nav.check"],
  ["/office", "nav.office"],
  ["/sent", "nav.sent"],
  ["/breach-day", "nav.breach"],
] as const;

export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span className="flex items-center gap-2.5">
      <Mark className={size === "lg" ? "h-10 w-10" : "h-8 w-8"} />
      <span className="flex items-baseline gap-2">
        <span className={`font-display font-semibold tracking-tight text-ink ${size === "lg" ? "text-[30px]" : "text-[23px]"}`}>Avaran</span>
        <span className={`font-display text-ink-3 ${size === "lg" ? "text-[18px]" : "text-[15px]"}`} lang="sa">
          आवरण
        </span>
      </span>
    </span>
  );
}

function LanguagePicker() {
  const t = useT(LAYOUT);
  return (
    <Tip text={t("lang.tip")} side="bottom">
      <label
        className="inline-flex items-center gap-1.5 rounded-md border border-line-2 bg-card py-0.5 pl-2 pr-1 text-[13.5px] text-ink-2 transition-colors hover:border-ink-3/40 focus-within:border-neel-600 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-neel-600"
      >
        <Icon name="globe" className="h-4 w-4 shrink-0 text-ink-3" />
        <LanguageSelect className="cursor-pointer bg-transparent py-0.5 pr-0.5 text-[13.5px] text-ink outline-none" />
      </label>
    </Tip>
  );
}

function skipToMain(e: MouseEvent<HTMLAnchorElement>) {
  const main = document.getElementById("main");
  if (!main) return;
  e.preventDefault();
  main.focus();
}

export function Layout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const t = useT(LAYOUT);
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        onClick={skipToMain}
        className="fixed left-3 top-3 z-50 -translate-y-24 rounded-md border border-neel-600 bg-card px-3 py-2 text-[15px] font-medium text-neel-700 shadow-sm focus:translate-y-0"
      >
        {t("skip")}
      </a>
      <header className="border-b border-line bg-card/70">
        <div className={`mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 ${wide ? "max-w-6xl" : "max-w-5xl"}`}>
          <Link to="/" aria-label={t("home")}>
            <Wordmark />
          </Link>
          <div className="contents sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
            <nav aria-label={t("nav.label")} className="order-last flex w-full flex-wrap gap-x-5 gap-y-1 text-[15px] sm:order-none sm:w-auto">
              {NAV.map(([to, key]) => (
                <Tip key={to} text={t(`${key}.tip`)} side="bottom">
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      `border-b-2 pb-0.5 transition-colors ${isActive ? "border-neel-600 text-ink" : "border-transparent text-ink-3 hover:border-line-2 hover:text-ink"}`
                    }
                  >
                    {t(key)}
                  </NavLink>
                </Tip>
              ))}
            </nav>
            <LanguagePicker />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={`mx-auto w-full flex-1 px-5 py-10 focus:outline-none ${wide ? "max-w-6xl" : "max-w-5xl"}`}>
        {children}
      </main>
      <footer className="border-t border-line">
        <div className={`mx-auto flex flex-wrap items-center justify-between gap-3 px-5 py-6 text-[13.5px] text-ink-3 ${wide ? "max-w-6xl" : "max-w-5xl"}`}>
          <span>
            <span className="font-display text-ink-2">Avaran</span> · {t("footer.tagline")}
          </span>
          <span>
            {t("footer.encrypted")} ·{" "}
            <a href="/privacy.html" className="underline decoration-line-2 underline-offset-2 hover:text-ink">
              {t("footer.privacy")}
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
