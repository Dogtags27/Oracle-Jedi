import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import type { HandoffStatus } from "@oj/core";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type Variant = "primary" | "ghost" | "danger" | "saber";

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-jedi-500 hover:bg-jedi-400 text-white",
    saber: "bg-saber/90 hover:bg-saber text-slate-950 shadow-[0_0_24px_rgba(57,255,158,0.35)]",
    ghost: "bg-white/5 hover:bg-white/10 text-slate-200 ring-1 ring-white/10",
    danger: "bg-sith/90 hover:bg-sith text-white",
  };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ title, subtitle, children, className, right }: { title?: ReactNode; subtitle?: ReactNode; children?: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={cx("rounded-2xl bg-slate-900/70 p-5 ring-1 ring-white/10 backdrop-blur", className)}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Input({ label, hint, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">{label}</span>}
      <input
        className={cx(
          "w-full rounded-lg bg-slate-950/80 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 outline-none placeholder:text-slate-600 focus:ring-jedi-400",
          className,
        )}
        {...props}
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Badge({ tone = "slate", children }: { tone?: "slate" | "green" | "red" | "blue" | "amber"; children: ReactNode }) {
  const tones = {
    slate: "bg-white/5 text-slate-300 ring-white/10",
    green: "bg-saber/10 text-saber ring-saber/30",
    red: "bg-sith/10 text-sith ring-sith/30",
    blue: "bg-jedi-500/10 text-jedi-400 ring-jedi-400/30",
    amber: "bg-amber-400/10 text-amber-300 ring-amber-300/30",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1", tones[tone])}>{children}</span>;
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? <Badge tone="green">✓ Domain verified</Badge> : <Badge tone="amber">Domain not yet verified</Badge>;
}

export function SafetyWords({ words }: { words: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {words.map((w, i) => (
        <span key={i} className="rounded-md bg-jedi-500/10 px-2 py-1 font-mono text-xs text-jedi-400 ring-1 ring-jedi-400/20">
          {w}
        </span>
      ))}
    </div>
  );
}

export function StatusChip({ status }: { status: HandoffStatus }) {
  const map: Record<HandoffStatus, { tone: "slate" | "green" | "red" | "blue" | "amber"; label: string }> = {
    pending: { tone: "slate", label: "Pending" },
    stored: { tone: "blue", label: "Sealed · waiting" },
    opened: { tone: "green", label: "Opened" },
    revoked: { tone: "red", label: "Revoked by sender" },
    expired: { tone: "amber", label: "Expired · destroyed" },
  };
  return <Badge tone={map[status].tone}>{map[status].label}</Badge>;
}

export function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />;
}

export function PqTag() {
  return <Badge tone="blue">HANDOFF-PQ1 · ML-KEM-768 + X25519 · ML-DSA-65</Badge>;
}
