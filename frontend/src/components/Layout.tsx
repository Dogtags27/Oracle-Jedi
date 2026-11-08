import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { Mark } from "./ui";

const NAV: [string, string][] = [
  ["/check", "Check a message"],
  ["/office", "For offices"],
  ["/sent", "My sealed files"],
  ["/breach-day", "Breach Day"],
];

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

export function Layout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-card/70">
        <div className={`mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 ${wide ? "max-w-6xl" : "max-w-5xl"}`}>
          <Link to="/" aria-label="Avaran home">
            <Wordmark />
          </Link>
          <nav className="flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
            {NAV.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `border-b-2 pb-0.5 transition-colors ${isActive ? "border-neel-600 text-ink" : "border-transparent text-ink-3 hover:border-line-2 hover:text-ink"}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-5 py-10 ${wide ? "max-w-6xl" : "max-w-5xl"}`}>{children}</main>
      <footer className="border-t border-line">
        <div className={`mx-auto flex flex-wrap items-center justify-between gap-3 px-5 py-6 text-[13.5px] text-ink-3 ${wide ? "max-w-6xl" : "max-w-5xl"}`}>
          <span>
            <span className="font-display text-ink-2">Avaran</span> · a layer between your documents and everyone else
          </span>
          <span>Documents are encrypted on your device. Our servers only ever hold ciphertext.</span>
        </div>
      </footer>
    </div>
  );
}
