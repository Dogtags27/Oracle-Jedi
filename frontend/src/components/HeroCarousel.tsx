import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./ui";

const INTERVAL = 5200;

type Slide = { key: string; label: string; title: string; line: string; bg: string; accent: string; icon: IconName; art: () => ReactNode };

const d = (ms: number) => ({ animationDelay: `${ms}ms` });

function CheckArt() {
  return (
    <div className="relative">
      <div className="hc-in rounded-xl border border-line bg-paper p-3 text-[12.5px] text-ink-2">
        <p className="font-semibold text-ink">Documents needed today</p>
        <p className="mt-1">
          From <span className="font-mono text-[11.5px]">maplestreet.tax.help@gmail.com</span>
        </p>
        <p>
          Upload at <span className="rounded bg-geru-50 px-1 font-mono text-[11.5px] text-geru-700 underline decoration-wavy">maple-street-taxdocs.co</span>
        </p>
      </div>
      <div className="hc-pop mt-3 rounded-xl border border-neem-200 bg-neem-50 p-3 text-[12px] text-neem-700" style={d(900)}>
        <p className="font-semibold">Official, from maplestreettax.site</p>
        <p className="mt-0.5">frontdesk@maplestreettax.site · (617) 555-0118</p>
      </div>
      <div className="hc-stamp absolute -right-3 -top-9 rotate-[-8deg] rounded-lg border-[3px] border-geru-600 bg-card px-3 py-1 font-display text-[19px] font-semibold uppercase tracking-wide text-geru-600" style={d(1500)}>
        Doesn't match
      </div>
    </div>
  );
}

function TrimArt() {
  const rows: [string, string, boolean][] = [
    ["Employee", "Dana Sample", false],
    ["SSN", "987-65-4321", true],
    ["Wages", "$61,240.00", false],
    ["Account", "2208-7781-0042", true],
  ];
  return (
    <div className="hc-in rounded-xl border border-line bg-paper p-3">
      <div className="flex items-center gap-2 text-[12px] text-ink-3">
        <Icon name="file" className="h-4 w-4" /> w2-2025.pdf
        <span className="ml-auto rounded-full bg-haldi-100 px-2 py-0.5 text-[11px] font-medium text-haldi-700">Trim</span>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map(([k, v, cut], i) => (
          <div key={k} className="flex items-center gap-3 text-[12.5px]">
            <span className="w-16 shrink-0 text-ink-3">{k}</span>
            <span className="relative font-mono text-ink">
              {v}
              {cut && <span className="hc-sweep absolute inset-y-[-2px] left-[-3px] rounded-sm bg-ink" style={d(700 + i * 450)} />}
            </span>
          </div>
        ))}
      </div>
      <div className="hc-pop mt-3 flex items-center gap-2 rounded-lg bg-neem-50 px-2.5 py-1.5 text-[12px] font-medium text-neem-700" style={d(2300)}>
        <Icon name="check" className="h-3.5 w-3.5" /> Re-scanned: 0 numbers left
      </div>
    </div>
  );
}

function SealArt() {
  const hex = "9f3a0c7be1d24a86f05c3e91b7d2a64f08e5c1b39a7d4e2f6b0c8a15d3e97f2c4a6b8d0e1f3a5c7e9b1d";
  return (
    <div className="hc-in grid grid-cols-[auto_1fr] items-center gap-3 rounded-xl border border-line bg-paper p-3">
      <div className="relative flex h-20 w-16 items-center justify-center rounded-lg border border-line bg-card">
        <Icon name="file" className="hc-fade-out h-8 w-8 text-ink-3" />
        <span className="hc-pop absolute inset-0 flex items-center justify-center rounded-lg bg-neem-600 text-paper" style={d(900)}>
          <Icon name="lock" className="h-8 w-8" />
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">What our server stores</p>
        <div className="mt-1 h-[54px] overflow-hidden rounded-md bg-ink px-2 py-1">
          <p className="hc-scroll break-all font-mono text-[10.5px] leading-[1.35] text-neem-200">
            {hex}
            {hex}
            {hex}
          </p>
        </div>
      </div>
      <div className="hc-pop col-span-2 flex flex-wrap items-center gap-2 text-[11.5px]" style={d(1400)}>
        <span className="rounded-full bg-neel-50 px-2 py-0.5 font-medium text-neel-700">ML-KEM-768 + X25519</span>
        <span className="rounded-full bg-haldi-50 px-2 py-0.5 font-medium text-haldi-700">self-destructs in 29 d</span>
        <span className="rounded-full bg-geru-50 px-2 py-0.5 font-medium text-geru-700">revoke anytime</span>
      </div>
    </div>
  );
}

function ChatLines({ blur }: { blur?: boolean }) {
  return (
    <div className={`space-y-1.5 p-2 ${blur ? "hc-blur" : ""}`}>
      {[["Mom", "Call me when you land"], ["Dr. Rivera", "Your results are ready"], ["Landlord", "Rent due Friday"]].map(([n, m]) => (
        <div key={n} className="flex items-center gap-2">
          <span className="h-5 w-5 shrink-0 rounded-full bg-geru-200" />
          <span className="min-w-0 truncate text-[11px] text-ink">
            <b className="font-semibold">{n}</b> <span className="text-ink-3">{m}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function SheatheArt() {
  return (
    <div className="hc-in grid grid-cols-2 gap-2.5">
      <div className="overflow-hidden rounded-xl border border-line bg-paper">
        <p className="border-b border-line bg-neem-50 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-neem-700">Your screen</p>
        <ChatLines />
      </div>
      <div className="relative overflow-hidden rounded-xl border border-line bg-paper">
        <p className="border-b border-line bg-geru-50 px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-geru-700">Meeting sees</p>
        <ChatLines blur />
        <span className="hc-pop absolute inset-x-0 bottom-3 text-center font-display text-[13px] font-semibold text-ink" style={d(1200)}>
          Veiled by Avaran
        </span>
      </div>
      <div className="hc-pop col-span-2 flex items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 text-[11.5px] text-ink-2" style={d(1700)}>
        <span className="h-2 w-2 rounded-full bg-geru-500" /> Share started · 6 ms later every chat was veiled
      </div>
    </div>
  );
}

function GuardArt() {
  return (
    <div className="hc-in relative rounded-xl border border-line bg-paper p-3 pb-14">
      <div className="relative rounded-lg bg-neel-700 p-3 pr-10 text-paper">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">Ad</p>
        <p className="font-display text-[16px] font-semibold leading-tight">Stream every movie, free</p>
        <span className="hc-target absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-paper/15 text-[14px]" style={d(1300)}>
          ✕
        </span>
      </div>
      <svg className="hc-cursor absolute right-6 top-12 h-6 w-6 drop-shadow" viewBox="0 0 24 24" aria-hidden>
        <path d="M5 3l14 8-6 1.6L10 19z" fill="#1e1b17" stroke="#fffdf8" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <div className="hc-pop absolute inset-x-3 bottom-2 rounded-lg border border-geru-200 bg-card px-2.5 py-1.5 text-[11.5px] shadow-sm" style={d(1700)}>
        <span className="font-semibold text-geru-700">A fake way out.</span> Says <b>✕</b> · goes to <b className="font-mono">popads.example</b>
      </div>
    </div>
  );
}

const SLIDES: Slide[] = [
  { key: "check", label: "Check", title: "Who's really asking?", line: "Compared with the office's own website, with quotes as proof.", bg: "bg-neel-700", accent: "text-neel-100", icon: "eye", art: CheckArt },
  { key: "trim", label: "Trim", title: "Send only what's needed", line: "SSNs and account numbers blacked out on your device.", bg: "bg-ink", accent: "text-haldi-200", icon: "scissors", art: TrimArt },
  { key: "seal", label: "Seal", title: "Sealed for one office", line: "Post-quantum encryption. Our servers only see noise.", bg: "bg-neem-600", accent: "text-neem-100", icon: "lock", art: SealArt },
  { key: "sheathe", label: "Sheathe", title: "Share your screen, not your chats", line: "WhatsApp and Gmail veil themselves the moment you present.", bg: "bg-geru-600", accent: "text-geru-100", icon: "shield", art: SheatheArt },
  { key: "guard", label: "Click Guard", title: "See where a button really goes", line: "Fake ✕ and decoy downloads flagged before you click.", bg: "bg-haldi-700", accent: "text-haldi-100", icon: "alert", art: GuardArt },
];

export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (paused || still) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), INTERVAL);
    return () => window.clearTimeout(t);
  }, [index, paused, still]);

  const slide = SLIDES[index]!;
  const Art = slide.art;

  return (
    <div className="w-full max-w-[460px] justify-self-center lg:justify-self-end" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className={`relative aspect-[4/5] max-h-[520px] w-full overflow-hidden rounded-[28px] shadow-[0_24px_60px_-20px_rgba(30,27,23,0.45)] transition-colors duration-700 ${slide.bg}`} aria-live="polite">
        <div className="jaali-light pointer-events-none absolute inset-0 opacity-60" />
        <div className="hc-arch pointer-events-none absolute -bottom-24 -right-16 h-[78%] w-[70%] rounded-t-full border-[18px] border-b-0 border-paper/10" />
        <div className="hc-arch pointer-events-none absolute -bottom-24 -right-2 h-[56%] w-[42%] rounded-t-full border-[14px] border-b-0 border-paper/15" style={d(150)} />

        <div key={`${slide.key}-mark`} className="hc-arch pointer-events-none absolute right-8 top-[34%] text-paper/[0.13]" style={d(120)}>
          <Icon name={slide.icon} className="h-40 w-40 -rotate-6" />
        </div>
        <div key={slide.key} className="relative flex h-full flex-col p-7">
          <div className="hc-in flex items-center gap-3">
            <span className="font-display text-[44px] font-semibold leading-none text-paper/90">{String(index + 1).padStart(2, "0")}</span>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-paper/15 text-paper">
              <Icon name={slide.icon} className="h-5 w-5" />
            </span>
            <span className={`ml-auto text-[12px] font-semibold uppercase tracking-[0.16em] ${slide.accent}`}>{slide.label}</span>
          </div>
          <h2 className="hc-in mt-5 font-display text-[29px] font-semibold leading-[1.1] text-paper" style={d(80)}>
            {slide.title}
          </h2>
          <p className={`hc-in mt-2 text-[15px] leading-snug ${slide.accent}`} style={d(160)}>
            {slide.line}
          </p>
          <div className="mt-auto rounded-2xl bg-card p-3 shadow-[0_12px_30px_-12px_rgba(30,27,23,0.5)]">
            <Art />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2" role="tablist" aria-label="Avaran features">
        {SLIDES.map((s, i) => (
          <button
            key={s.key}
            role="tab"
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            className={`group text-left text-[11.5px] font-medium transition-colors ${i === index ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
          >
            <span className="block h-1 overflow-hidden rounded-full bg-line">
              {i === index && <span key={`${s.key}-${paused}`} className={`block h-full rounded-full ${s.bg} ${still ? "w-full" : "hc-progress"}`} style={{ animationDuration: `${INTERVAL}ms`, animationPlayState: paused ? "paused" : "running" }} />}
              {i < index && <span className="block h-full w-full rounded-full bg-line-2" />}
            </span>
            <span className="mt-1.5 block truncate">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
