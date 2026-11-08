import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

export function Layout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_at_top,rgba(30,144,255,0.15),transparent_60%)]">
      <div className={`mx-auto px-4 py-6 ${wide ? "max-w-6xl" : "max-w-4xl"}`}>
        <header className="mb-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <span className="h-6 w-1 rounded-full bg-saber shadow-[0_0_12px_rgba(57,255,158,0.8)]" />
            <span className="text-lg font-semibold tracking-wide">Oracle Jedi</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {[
              ["/check", "Check"],
              ["/office", "Office"],
              ["/breach-day", "Breach Day"],
            ].map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 ${isActive ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
        {children}
      </div>
    </div>
  );
}
