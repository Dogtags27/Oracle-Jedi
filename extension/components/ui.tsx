import type { ButtonHTMLAttributes, ReactNode, SVGProps } from "react";
import type { HandoffStatus } from "@oj/core";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type Variant = "primary" | "ghost" | "danger" | "saber";

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const styles: Record<Variant, string> = {
    primary: "bg-neel-700 text-card border border-neel-800 hover:bg-neel-800",
    saber: "bg-neel-700 text-card border border-neel-800 hover:bg-neel-800",
    ghost: "bg-card text-ink border border-line-2 hover:bg-paper-2",
    danger: "bg-geru-600 text-card border border-geru-700 hover:bg-geru-700",
  };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13.5px] font-medium leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

export type Tone = "slate" | "green" | "red" | "blue" | "amber";

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  const tones: Record<Tone, string> = {
    slate: "bg-paper-2 text-ink-2 border-line",
    green: "bg-neem-50 text-neem-700 border-neem-200",
    red: "bg-geru-50 text-geru-700 border-geru-200",
    blue: "bg-neel-50 text-neel-700 border-neel-200",
    amber: "bg-haldi-50 text-haldi-700 border-haldi-200",
  };
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11.5px] font-medium leading-5", tones[tone])}>{children}</span>;
}

export function Section({ title, right, children, className }: { title?: ReactNode; right?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-card p-3.5", className)}>
      {(title || right) && (
        <div className="mb-2.5 flex items-center justify-between gap-2">
          {title && <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3 [font-family:var(--font-sans)]">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function SafetyWords({ words }: { words: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {words.map((w, i) => (
        <span key={i} className="rounded-md border border-neel-200 bg-neel-50 px-1.5 py-0.5 font-mono text-[11.5px] text-neel-700">
          {w}
        </span>
      ))}
    </div>
  );
}

export function StatusChip({ status }: { status: HandoffStatus }) {
  const map: Record<HandoffStatus, { tone: Tone; label: string }> = {
    pending: { tone: "slate", label: "Pending" },
    stored: { tone: "blue", label: "Sealed · waiting" },
    opened: { tone: "green", label: "Opened" },
    revoked: { tone: "red", label: "Revoked" },
    expired: { tone: "amber", label: "Expired · destroyed" },
  };
  return <Badge tone={map[status].tone}>{map[status].label}</Badge>;
}

export function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/25 border-t-current" />;
}

export function bytes(n: number | null | undefined): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function countdown(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
  if (s === 0) return "destroying…";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function DomainParts({ host, domain }: { host: string; domain: string }) {
  const sub = host.endsWith(domain) ? host.slice(0, host.length - domain.length) : "";
  return (
    <span className="font-mono">
      <span className="text-ink-3">{sub}</span>
      <span className="font-semibold text-ink">{domain || host}</span>
    </span>
  );
}

export type IconName = "lock" | "shield" | "check" | "x" | "alert" | "eye" | "arrow";

const PATHS: Record<IconName, ReactNode> = {
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  alert: (
    <>
      <path d="M12 4l9 16H3l9-16z" />
      <path d="M12 10v4M12 17.5v.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
};

export function Icon({ name, className = "h-4 w-4", ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} {...props}>
      {PATHS[name]}
    </svg>
  );
}

export function Mark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path d="M5 28V14.5a11 11 0 0 1 22 0V28" stroke="#2b3666" strokeWidth="2.4" />
      <path d="M10.5 28V16a5.5 5.5 0 0 1 11 0v12" stroke="#b04b32" strokeWidth="2.4" />
      <path d="M3 28h26" stroke="#2b3666" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
