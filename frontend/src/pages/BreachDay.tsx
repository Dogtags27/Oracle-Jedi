import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Badge, Button, Icon, PqTag, Spinner, type IconName } from "../components/ui";

type Phase = "idle" | "running" | "done";
type Side = "left" | "right";
type Fate = "expired" | "revoked" | "cipher" | "key";
type TileState = "idle" | "current" | "out";

interface Doc {
  id: string;
  label: string;
  title: string;
  size: string;
  date: string;
  key: string;
  snippet: string;
  ssns: string[];
  accounts: string[];
  fate: Fate;
}

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const DANA = "987-65-4321";
const SAM = "987-65-4322";
const AVA = "987-65-4323";
const LEO = "987-65-4324";
const CHECKING = "Acct 2208-7781";
const BROKERAGE = "Acct WB-33902";
const MORTGAGE = "Loan HM-55210";

const DOCS: Doc[] = [
  { id: "w2-dana", label: "W-2 · Dana", title: "W-2 wage statement · Copperfinch Freight", size: "184 KB", date: "Jan 27", key: `SSN ${DANA}`, snippet: `Dana Whitfield · SSN ${DANA} · Wages $84,200.00`, ssns: [DANA], accounts: [], fate: "expired" },
  { id: "license", label: "Driver's license", title: "Driver's license photo, front and back", size: "2.1 MB", date: "Jan 27", key: "DOB 04/12/1986", snippet: "Dana Whitfield · License SAMPLE-D482107 · DOB 04/12/1986 · 14 Alder Way, Fernvale", ssns: [], accounts: [], fate: "expired" },
  { id: "ss-dana", label: "SS card · Dana", title: "Social Security card photo · Dana", size: "1.4 MB", date: "Jan 27", key: `SSN ${DANA}`, snippet: `DANA M WHITFIELD · ${DANA}`, ssns: [DANA], accounts: [], fate: "revoked" },
  { id: "w2-sam", label: "W-2 · Sam", title: "W-2 wage statement · Wrenhaven Schools", size: "176 KB", date: "Jan 29", key: `SSN ${SAM}`, snippet: `Sam Whitfield · SSN ${SAM} · Wages $61,450.00`, ssns: [SAM], accounts: [], fate: "expired" },
  { id: "stmt-oct", label: "Bank stmt · Oct", title: "October statement · Bramblecrest Credit Union", size: "412 KB", date: "Feb 2", key: CHECKING, snippet: `${CHECKING} · Balance $6,204.55 · 41 transactions`, ssns: [], accounts: [CHECKING], fate: "expired" },
  { id: "1099-int", label: "1099-INT", title: "1099-INT interest · Bramblecrest Credit Union", size: "96 KB", date: "Feb 2", key: `SSN ${DANA}`, snippet: `Dana Whitfield · SSN ${DANA} · Interest $312.18 · ${CHECKING}`, ssns: [DANA], accounts: [CHECKING], fate: "cipher" },
  { id: "1095-c", label: "1095-C · family", title: "1095-C health coverage · Kettlebrook Health Plan", size: "220 KB", date: "Feb 4", key: "4 SSNs listed", snippet: `Dana ${DANA} · Sam ${SAM} · Ava ${AVA} · Leo ${LEO}`, ssns: [DANA, SAM, AVA, LEO], accounts: [], fate: "expired" },
  { id: "1099-div", label: "1099-DIV", title: "1099-DIV dividends · Wrenfield Brokerage", size: "88 KB", date: "Feb 9", key: `SSN ${DANA}`, snippet: `Dana Whitfield · SSN ${DANA} · Dividends $1,046.90 · ${BROKERAGE}`, ssns: [DANA], accounts: [BROKERAGE], fate: "expired" },
  { id: "1099-b", label: "1099-B", title: "1099-B sales · Wrenfield Brokerage", size: "310 KB", date: "Feb 9", key: BROKERAGE, snippet: `${BROKERAGE} · Proceeds $18,320.00 · Cost basis $15,940.00`, ssns: [], accounts: [BROKERAGE], fate: "key" },
  { id: "1098", label: "1098 · mortgage", title: "1098 mortgage interest · Hollowpine Mortgage", size: "102 KB", date: "Feb 10", key: MORTGAGE, snippet: `Dana Whitfield · SSN ${DANA} · ${MORTGAGE} · Interest $9,871.44`, ssns: [DANA], accounts: [MORTGAGE], fate: "expired" },
  { id: "ss-ava", label: "SS card · Ava", title: "Social Security card photo · Ava", size: "1.2 MB", date: "Feb 11", key: `SSN ${AVA}`, snippet: `AVA R WHITFIELD · ${AVA}`, ssns: [AVA], accounts: [], fate: "revoked" },
  { id: "daycare", label: "Daycare receipts", title: "Childcare receipts · Fernhollow Daycare", size: "540 KB", date: "Feb 11", key: "Ava DOB 03/02/19", snippet: "Ava Whitfield, DOB 03/02/2019 · Leo Whitfield, DOB 09/17/2021 · Paid $9,600.00", ssns: [], accounts: [], fate: "expired" },
  { id: "1098-t", label: "1098-T · tuition", title: "1098-T tuition · Saltmarsh College", size: "74 KB", date: "Feb 16", key: `SSN ${SAM}`, snippet: `Sam Whitfield · SSN ${SAM} · Tuition $7,800.00`, ssns: [SAM], accounts: [], fate: "cipher" },
  { id: "stmt-nov", label: "Bank stmt · Nov", title: "November statement · Bramblecrest Credit Union", size: "398 KB", date: "Feb 16", key: CHECKING, snippet: `${CHECKING} · Balance $5,880.12 · 38 transactions`, ssns: [], accounts: [CHECKING], fate: "expired" },
  { id: "1099-nec", label: "1099-NEC", title: "1099-NEC freelance pay · Quillhouse Design Studio", size: "81 KB", date: "Feb 18", key: `SSN ${DANA}`, snippet: `Dana Whitfield · SSN ${DANA} · Nonemployee pay $4,200.00`, ssns: [DANA], accounts: [], fate: "key" },
  { id: "passport", label: "Passport · Sam", title: "Passport photo page · Sam", size: "2.6 MB", date: "Feb 18", key: "DOB 11/30/1984", snippet: "Sam Whitfield · Passport SAMPLE-X01984 · DOB 11/30/1984", ssns: [], accounts: [], fate: "revoked" },
  { id: "return-2024", label: "2024 return", title: "Prior-year return, Form 1040, signed", size: "1.8 MB", date: "Feb 23", key: "AGI $139,880", snippet: `Dana & Sam Whitfield · ${DANA} · ${SAM} · AGI $139,880 · refund to ${CHECKING}`, ssns: [DANA, SAM], accounts: [CHECKING], fate: "expired" },
  { id: "stmt-dec", label: "Bank stmt · Dec", title: "December statement · Bramblecrest Credit Union", size: "405 KB", date: "Feb 23", key: CHECKING, snippet: `${CHECKING} · Balance $7,112.90 · 44 transactions`, ssns: [], accounts: [CHECKING], fate: "cipher" },
  { id: "ss-leo", label: "SS card · Leo", title: "Social Security card photo · Leo", size: "1.1 MB", date: "Mar 3", key: `SSN ${LEO}`, snippet: `LEO J WHITFIELD · ${LEO}`, ssns: [LEO], accounts: [], fate: "expired" },
  { id: "5498-sa", label: "5498-SA · HSA", title: "5498-SA health savings · Kettlebrook Health Plan", size: "66 KB", date: "Mar 3", key: `SSN ${DANA}`, snippet: `Dana Whitfield · SSN ${DANA} · HSA contributions $3,850.00`, ssns: [DANA], accounts: [], fate: "key" },
  { id: "property-tax", label: "Property tax", title: "Property tax bill · Alder County", size: "150 KB", date: "Mar 9", key: "14 Alder Way", snippet: "Dana & Sam Whitfield · 14 Alder Way, Fernvale · Paid $5,412.00", ssns: [], accounts: [], fate: "expired" },
  { id: "voided-check", label: "Voided check", title: "Voided check for the refund deposit", size: "900 KB", date: "Mar 9", key: CHECKING, snippet: `Dana Whitfield · 14 Alder Way, Fernvale · ${CHECKING}`, ssns: [], accounts: [CHECKING], fate: "cipher" },
  { id: "8879", label: "8879 · e-file", title: "Form 8879 e-file signature page", size: "130 KB", date: "Mar 14", key: `SSN ${DANA}`, snippet: `Dana & Sam Whitfield · ${DANA} · ${SAM} · AGI $142,310 · signed`, ssns: [DANA, SAM], accounts: [], fate: "key" },
];

const TOTAL = DOCS.length;
const INTRO_MS = 1000;
const OUTRO_MS = 900;
const gapAfter = (i: number) => (i < 3 ? 800 : i < 6 ? 400 : 220);
const STEP_AT = DOCS.map((_, i) => INTRO_MS + DOCS.slice(0, i).reduce((t, _d, k) => t + gapAfter(k), 0));
const DONE_AT = STEP_AT[STEP_AT.length - 1] + OUTRO_MS;
const RUN_SECONDS = Math.round(DONE_AT / 1000);

function cipherText(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const words: string[] = [];
  for (let i = 0; i < 6; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    words.push((h >>> 16).toString(16).padStart(4, "0"));
  }
  return words.join(" ");
}

const FATE: Record<Fate, { short: string; detail: (d: Doc) => string }> = {
  expired: { short: "Expired · destroyed", detail: () => "Link opened → “Expired. The office opened it, then the sealed copy was destroyed.”" },
  revoked: { short: "Revoked by Dana", detail: () => "Link opened → “Revoked by sender. Nothing left to download.”" },
  cipher: { short: "Ciphertext only", detail: (d) => `Downloaded ciphertext only: ${cipherText(d.id)} …` },
  key: { short: "Sealed to office key", detail: () => "Link opened → “Sealed to Maple Street Tax. Needs the office's private key, which isn't in any mailbox.”" },
};

const FATE_COUNT = DOCS.reduce<Record<Fate, number>>((acc, d) => ({ ...acc, [d.fate]: acc[d.fate] + 1 }), { expired: 0, revoked: 0, cipher: 0, key: 0 });
const SEALED_COUNT = FATE_COUNT.cipher + FATE_COUNT.key;
const ALL_SSNS = new Set(DOCS.flatMap((d) => d.ssns)).size;
const ALL_ACCOUNTS = new Set(DOCS.flatMap((d) => d.accounts)).size;

const STORY: { n: string; when: string; title: string; body: string }[] = [
  {
    n: "01",
    when: "Tax season",
    title: "Dana sends her documents",
    body: `Dana, a fictional client, sends ${TOTAL} files to Maple Street Tax, a small local office: W-2s, 1099s, bank statements and ID photos for the whole family.`,
  },
  {
    n: "02",
    when: "Weeks later",
    title: "Breach Day",
    body: "Someone gets into the office's mailbox and quietly exports every message in it. Dana is not there, and has no say.",
  },
  {
    n: "03",
    when: "On this page",
    title: "Count what they can read",
    body: "Same family, same office, same break-in, side by side. On the left Dana emailed attachments. On the right she sent them with Avaran.",
  },
];

const REASONS: { count: number; title: string; body: string }[] = [
  {
    count: FATE_COUNT.expired,
    title: "Expired and destroyed",
    body: "The office opened these when it needed them. Then the timer ran out and the sealed copy was destroyed, so the link leads nowhere.",
  },
  {
    count: FATE_COUNT.revoked,
    title: "Revoked by Dana",
    body: "She took these back from her sealed files page. The link now answers “revoked” and there is nothing to download.",
  },
  {
    count: SEALED_COUNT,
    title: "Still sealed",
    body: "Ciphertext. Only Maple Street Tax's private key opens it, and that key never sits in the mailbox.",
  },
];

const CONTROLS: { icon: IconName; title: string; body: string; to?: string; cta?: string }[] = [
  { icon: "eye", title: "Who gets it", body: "Send only to an office whose own website vouches for the request.", to: "/check", cta: "Check a message" },
  { icon: "scissors", title: "What's in it", body: "Trim blacks out numbers they didn't ask for on your device, so no copy anywhere has them." },
  { icon: "lock", title: "How long it lasts", body: "Sealed to one office, destroyed on a timer, and revocable whenever you change your mind.", to: "/sent", cta: "My sealed files" },
];

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function ClipIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-2 bg-card px-1.5 py-px font-mono text-[11px] text-ink-2">{children}</kbd>;
}

function PaperTile({ doc, state }: { doc: Doc; state: TileState }) {
  const out = state !== "idle";
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-lg border px-2.5 py-2 transition-all duration-300 motion-reduce:transition-none",
        state === "idle" && "border-line bg-paper-2/50 text-ink-2",
        state === "out" && "border-geru-200 bg-card text-ink",
        state === "current" && "z-10 scale-105 border-geru-500 bg-card text-ink shadow-[0_6px_18px_rgba(30,27,23,0.14)]",
      )}
    >
      {out && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2 flex -rotate-12 select-none items-center text-base font-bold tracking-[0.2em] text-geru-700/10">
          SAMPLE
        </span>
      )}
      <p className="relative flex items-center gap-1.5 text-sm font-semibold">
        {out ? <Icon name="eye" className="h-3.5 w-3.5 shrink-0 text-geru-600" /> : <ClipIcon className="h-3.5 w-3.5 shrink-0 text-ink-3" />}
        <span className="truncate">{doc.label}</span>
      </p>
      <p className={cx("relative mt-0.5 truncate text-xs", out ? "font-mono font-semibold text-geru-700" : "text-ink-3")}>{out ? doc.key : `${doc.size} · ${doc.date}`}</p>
    </div>
  );
}

function SealedTile({ doc, state }: { doc: Doc; state: TileState }) {
  const out = state !== "idle";
  return (
    <div
      className={cx(
        "relative rounded-lg border px-2.5 py-2 transition-all duration-300 motion-reduce:transition-none",
        state === "idle" && "border-line bg-paper-2/50",
        state === "out" && "border-neem-200 bg-neem-50/70",
        state === "current" && "z-10 scale-105 border-neel-600 bg-card shadow-[0_6px_18px_rgba(30,27,23,0.14)]",
      )}
    >
      <p className={cx("flex items-center gap-1.5 text-sm font-semibold", out ? "text-ink-3" : "text-ink-2")}>
        <Icon name="lock" className={cx("h-3.5 w-3.5 shrink-0", out ? "text-neem-600" : "text-neel-600")} />
        <span className="truncate">{doc.label}</span>
      </p>
      <p className={cx("mt-0.5 truncate text-xs font-medium", out ? "text-neem-700" : "text-ink-3")}>{out ? FATE[doc.fate].short : `Sealed link · ${doc.date}`}</p>
    </div>
  );
}

type SpotTone = "quiet" | "leak" | "exposed" | "sealed" | "safe";

interface Spot {
  tone: SpotTone;
  eyebrow: string;
  title: string;
  body: string;
  mono?: boolean;
}

function Spotlight({ spot, tag, motionKey }: { spot: Spot; tag?: ReactNode; motionKey: string }) {
  const tones: Record<SpotTone, string> = {
    quiet: "border-line bg-paper-2/50 text-ink-2",
    leak: "border-geru-200 bg-card text-ink",
    exposed: "border-geru-200 bg-geru-50 text-ink",
    sealed: "border-line bg-card text-ink-2",
    safe: "border-neem-200 bg-neem-50 text-ink",
  };
  return (
    <div className={cx("mt-4 h-[8rem] overflow-hidden rounded-xl border px-4 py-3 transition-colors duration-300 sm:h-[6.75rem]", tones[spot.tone])}>
      <div key={motionKey} className="transition duration-100 starting:translate-y-1 starting:opacity-25 motion-reduce:transition-none">
        <div className="flex h-4 items-center justify-between gap-3">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-3">{spot.eyebrow}</p>
          {tag}
        </div>
        <p className="mt-1 truncate text-sm font-semibold">{spot.title}</p>
        <p className={cx("mt-1 line-clamp-3 leading-5 sm:line-clamp-2", spot.mono ? "font-mono text-[13px]" : "text-sm")}>{spot.body}</p>
      </div>
    </div>
  );
}

function spotlightFor(side: Side, phase: Phase, step: number): Spot {
  const left = side === "left";
  const doc = phase === "running" && step > 0 ? DOCS[step - 1] : null;
  if (phase === "idle") {
    return left
      ? { tone: "quiet", eyebrow: "Before Breach Day", title: `${TOTAL} attachments in the office inbox`, body: "Each one is an ordinary file. Anyone who gets into the mailbox can open it." }
      : { tone: "quiet", eyebrow: "Before Breach Day", title: `${TOTAL} sealed links in the office inbox`, body: "Each file is sealed to Maple Street Tax's verified key. The mailbox only holds links." };
  }
  if (phase === "done") {
    return left
      ? {
          tone: "exposed",
          eyebrow: `Export finished · ${TOTAL} of ${TOTAL}`,
          title: "Everything is readable",
          body: `${ALL_SSNS} Social Security numbers, the whole family · ${ALL_ACCOUNTS} account numbers · 2 photo IDs · home address · kids' birthdays`,
        }
      : {
          tone: "safe",
          eyebrow: `Export finished · ${TOTAL} of ${TOTAL}`,
          title: "Nothing is readable",
          body: `${FATE_COUNT.expired} expired and destroyed · ${FATE_COUNT.revoked} revoked by Dana · ${SEALED_COUNT} still sealed to the office's key`,
        };
  }
  if (!doc) {
    return { tone: "quiet", eyebrow: "Breach in progress", title: "Someone is in the mailbox", body: left ? "Exporting every message and every attachment…" : "Exporting every message and every link…" };
  }
  return left
    ? { tone: "leak", eyebrow: `Attacker opens ${step} of ${TOTAL}`, title: doc.title, body: doc.snippet, mono: true }
    : { tone: "sealed", eyebrow: `Attacker opens ${step} of ${TOTAL}`, title: `Link to ${doc.title}`, body: FATE[doc.fate].detail(doc), mono: true };
}

function InboxPanel({ side, phase, step }: { side: Side; phase: Phase; step: number }) {
  const left = side === "left";
  const live = phase !== "idle";
  const exported = DOCS.slice(0, step);
  const readable = left ? step : 0;
  const ssns = left ? new Set(exported.flatMap((d) => d.ssns)).size : 0;
  const accounts = left ? new Set(exported.flatMap((d) => d.accounts)).size : 0;
  const spot = spotlightFor(side, phase, step);
  const current = phase === "running" && step > 0 ? DOCS[step - 1] : null;

  const frame = !live ? "border-line" : left ? (phase === "done" ? "border-geru-500" : "border-geru-200") : phase === "done" ? "border-neem-500" : "border-neel-200";

  const badge =
    phase === "idle" ? (
      left ? (
        <Badge tone="slate">
          <ClipIcon className="h-3 w-3" /> {TOTAL} attachments
        </Badge>
      ) : (
        <Badge tone="blue">
          <Icon name="lock" className="h-3 w-3" /> {TOTAL} sealed links
        </Badge>
      )
    ) : phase === "running" ? (
      <Badge tone="red">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-geru-600 motion-reduce:animate-none" /> Exporting
      </Badge>
    ) : left ? (
      <Badge tone="red">Everything readable</Badge>
    ) : (
      <Badge tone="green">
        <Icon name="check" className="h-3.5 w-3.5" /> Nothing readable
      </Badge>
    );

  const countTone = !live ? "text-ink-3/60" : left ? "text-geru-600" : "text-neem-600";
  const statTone = (n: number) => (n ? "text-geru-700" : live ? "text-neem-700" : "text-ink");

  return (
    <section aria-label={left ? "Without Avaran" : "With Avaran"} className={cx("min-w-0 rounded-2xl border-2 bg-card p-5 transition-colors duration-500 sm:p-6", frame)}>
      <div className={cx("flex items-start justify-between gap-4", !left && "lg:flex-row-reverse")}>
        <div className={cx("min-w-0", !left && "lg:text-right")}>
          <p className={cx("text-[12.5px] font-semibold uppercase tracking-[0.16em]", left ? "text-geru-600" : "text-neel-700")}>{left ? "Without Avaran" : "With Avaran"}</p>
          <h2 className="mt-1 text-[22px] font-semibold leading-tight text-ink sm:text-[25px]">{left ? "Emailed as attachments" : "Sent as sealed links"}</h2>
          <p className="mt-1 text-[14.5px] leading-snug text-ink-3">{left ? "The usual way. Every file sits in the inbox as is." : "The inbox only holds links to sealed files."}</p>
          <div className={cx("mt-3 flex", !left && "lg:justify-end")}>{badge}</div>
        </div>
        <div className={cx("shrink-0 text-right", !left && "lg:text-left")}>
          <p
            key={readable}
            className={cx("font-display text-[64px] font-semibold leading-[0.9] tabular-nums transition duration-200 starting:scale-110 motion-reduce:transition-none sm:text-[76px]", countTone)}
          >
            {readable}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-tight text-ink-2">
            of {TOTAL} documents
            <br />
            <span className="font-semibold">readable</span>
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex gap-0.5" aria-hidden>
          {DOCS.map((d, i) => (
            <span key={d.id} className={cx("h-1.5 flex-1 rounded-full transition-colors duration-200", i < step ? (left ? "bg-geru-500" : "bg-neel-600") : "bg-line")} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-ink-3">
          <span>
            Taken <b className="tabular-nums text-ink">{step}</b> of {TOTAL}
          </span>
          <span>
            SSNs readable <b className={cx("tabular-nums", statTone(ssns))}>{ssns}</b>
          </span>
          <span>
            Account numbers readable <b className={cx("tabular-nums", statTone(accounts))}>{accounts}</b>
          </span>
        </div>
      </div>

      <Spotlight
        spot={spot}
        motionKey={`${phase}-${step}`}
        tag={
          left && spot.tone === "leak" ? (
            <span className="rounded border border-geru-600/60 px-1.5 text-[10px] font-bold leading-4 tracking-widest text-geru-700">SAMPLE</span>
          ) : !left && current ? (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neem-700">{FATE[current.fate].short}</span>
          ) : null
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {DOCS.map((d, i) => {
          const state: TileState = i >= step ? "idle" : current && i === step - 1 ? "current" : "out";
          return left ? <PaperTile key={d.id} doc={d} state={state} /> : <SealedTile key={d.id} doc={d} state={state} />;
        })}
      </div>

      <p className="mt-4 text-[14px] leading-relaxed text-ink-3">
        {left ? (
          <>
            <span className="font-semibold text-ink-2">Attachments never expire.</span> Every copy stays readable: in the inbox, in Sent, in backups, in every export.
          </>
        ) : (
          <>
            <span className="font-semibold text-ink-2">A link is not the document.</span> What sits behind each one is destroyed, revoked or still sealed.
          </>
        )}
      </p>
    </section>
  );
}

function Status({ phase, step }: { phase: Phase; step: number }) {
  if (phase === "idle") {
    return (
      <p className="text-[15px] leading-snug text-ink-2 sm:text-[16px]">
        <span className="font-semibold text-ink">Press Run Breach Day</span>
        <span className="hidden sm:inline"> and watch the two counters. Takes about {RUN_SECONDS} seconds.</span>
        <span className="sm:hidden"> and watch the counters.</span>
      </p>
    );
  }
  if (phase === "running") {
    return (
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-geru-500 opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-geru-600" />
        </span>
        <p className="text-[15px] leading-snug text-ink sm:text-[16px]">
          <span className="hidden sm:inline">
            <span className="font-semibold">Breach in progress.</span> Exporting both inboxes, <span className="tabular-nums">message {step} of {TOTAL}…</span>
          </span>
          <span className="tabular-nums sm:hidden">
            <span className="font-semibold">Readable:</span> <b className="text-geru-700">{step}</b> without Avaran · <b className="text-neem-700">0</b> with
          </span>
        </p>
      </div>
    );
  }
  return (
    <p className="text-[15px] leading-snug text-ink sm:text-[17px]">
      <span className="font-semibold">Same break-in.</span> Without Avaran the attacker reads{" "}
      <b className="font-display text-[19px] font-semibold tabular-nums text-geru-600 sm:text-[22px]">{TOTAL}</b> of {TOTAL}. With Avaran,{" "}
      <b className="font-display text-[19px] font-semibold text-neem-600 sm:text-[22px]">0</b>.
    </p>
  );
}

export default function BreachDayPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const bringStageIntoView = useCallback(() => {
    const bar = barRef.current;
    const stage = stageRef.current;
    if (!bar || !stage) return;
    const offset = 8 + bar.offsetHeight + 12;
    const top = window.scrollY + stage.getBoundingClientRect().top - offset;
    if (Math.abs(top - window.scrollY) < 24) return;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, []);

  const run = useCallback(() => {
    bringStageIntoView();
    if (prefersReducedMotion()) {
      setStep(TOTAL);
      setPhase("done");
      return;
    }
    setStep(0);
    setPhase("running");
  }, [bringStageIntoView]);

  const reset = useCallback(() => {
    setPhase("idle");
    setStep(0);
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    const timers = STEP_AT.map((at, i) => setTimeout(() => setStep(i + 1), at));
    timers.push(setTimeout(() => setPhase("done"), DONE_AT));
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input, textarea, select, [contenteditable]")) return;
      const runKey = e.key === " " || e.key === "Enter";
      if (runKey) {
        if (target?.closest("button") || (e.key === "Enter" && target?.closest("a"))) return;
        e.preventDefault();
        if (phase === "idle") run();
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        reset();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, run, reset]);

  const press = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail > 0) e.currentTarget.blur();
    fn();
  };

  const showWhy = () => document.getElementById("why")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });

  return (
    <Layout wide>
      <section className="grid items-start gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="lg:pt-2">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-geru-600">Breach Day · a {RUN_SECONDS}-second demo</p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.1] text-ink sm:text-[46px]">
            <span className="block text-balance">Every office has a bad day.</span>
            <span className="block text-balance text-ink-3">Will your documents be readable?</span>
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-2 sm:text-[18px]">
            <b className="font-semibold text-ink">Breach Day</b> is the day someone gets into the inbox your documents were sent to. One phished password is enough. Nobody warns
            you, and an attachment can't be taken back.
          </p>
          <p className="mt-4 max-w-xl border-l-2 border-geru-200 pl-4 text-[17px] leading-relaxed text-ink sm:text-[18px]">
            What the attacker can read was settled months earlier, on the day you pressed send.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-card p-6">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-ink-3">What you're about to see</p>
          <ol className="mt-4">
            {STORY.map((s, i) => (
              <li key={s.n} className="flex gap-4">
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <span className="font-display text-[22px] font-semibold leading-none text-geru-500">{s.n}</span>
                  {i < STORY.length - 1 && <span aria-hidden className="mt-2 w-px flex-1 bg-line-2" />}
                </div>
                <div className={cx("min-w-0", i < STORY.length - 1 && "pb-5")}>
                  <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-3">{s.when}</p>
                  <h3 className="text-[17px] font-semibold leading-snug text-ink">{s.title}</h3>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div ref={barRef} className="sticky top-2 z-30 mt-10 rounded-xl border border-line-2 bg-card/95 px-4 py-3 shadow-[0_4px_14px_rgba(30,27,23,0.07)] backdrop-blur-sm sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div role="status" className="min-w-0 flex-1 basis-64">
            <Status phase={phase} step={step} />
          </div>
          <div className="flex items-center gap-2">
            {phase === "done" && (
              <button type="button" onClick={showWhy} className="mr-1 inline-flex items-center gap-1 whitespace-nowrap text-[15px] font-medium text-neel-700 hover:underline">
                Why zero? <Icon name="arrow" className="h-4 w-4 rotate-90" />
              </button>
            )}
            <Button variant="ghost" className="px-4! py-2.5!" onClick={press(reset)} disabled={phase === "idle"}>
              Reset
            </Button>
            <Button data-run className="min-w-36 px-5! py-2.5! font-semibold! sm:min-w-44" onClick={press(run)} disabled={phase === "running"}>
              {phase === "running" ? (
                <>
                  <Spinner /> Exporting…
                </>
              ) : phase === "done" ? (
                "Run again"
              ) : (
                "Run Breach Day"
              )}
            </Button>
          </div>
        </div>
        <p className="mt-2 hidden text-[12px] text-ink-3 sm:block">
          <Kbd>Space</Kbd> or <Kbd>Enter</Kbd> to run · <Kbd>R</Kbd> to reset · fictional family, SAMPLE documents, nothing leaves this page
        </p>
      </div>

      <div ref={stageRef} className="relative mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InboxPanel side="left" phase={phase} step={step} />
        <span
          aria-hidden
          className={cx(
            "absolute left-1/2 top-[3.75rem] z-20 hidden h-11 w-11 -translate-x-1/2 place-items-center rounded-full border bg-paper font-display text-[15px] font-semibold transition-colors duration-500 lg:grid",
            phase === "done" ? "border-ink-3 text-ink" : "border-line-2 text-ink-3",
          )}
        >
          vs
        </span>
        <InboxPanel side="right" phase={phase} step={step} />
      </div>

      <section id="why" className="mt-16 scroll-mt-28 border-t border-line pt-12">
        <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-geru-600">What the attacker walks away with</p>
        <h2 className="mt-3 text-[26px] font-semibold leading-snug text-ink sm:text-[30px]">Same break-in. Why the Avaran side reads zero.</h2>
        <p className="mt-3 max-w-3xl text-[16.5px] leading-relaxed text-ink-2">
          On the left, the mailbox is the vault: every attachment is a complete, readable copy, and the attacker gets <span className="whitespace-nowrap">{TOTAL} of {TOTAL}</span>. On the right, the mailbox only
          ever held links, and each of Dana's {TOTAL} links ended one of three ways.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {REASONS.map((r) => (
            <div key={r.title} className="rounded-xl border border-line bg-card p-5">
              <p className="flex items-baseline gap-2">
                <span className="font-display text-[38px] font-semibold leading-none text-neem-600 tabular-nums">{r.count}</span>
                <span className="text-[13.5px] text-ink-3">of {TOTAL} links</span>
              </p>
              <h3 className="mt-3 text-[17px] font-semibold text-ink">{r.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{r.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14.5px] text-ink-2">
          <p>
            <span className="font-semibold text-ink">Copying the ciphertext to crack it later?</span> The key exchange is post-quantum: ML-KEM-768 combined with X25519.
          </p>
          <PqTag />
        </div>
      </section>

      <section className="jaali-soft mt-14 rounded-2xl border border-line bg-paper-2/60 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr] lg:gap-12">
          <div>
            <h2 className="text-[26px] font-semibold leading-tight text-ink sm:text-[30px]">
              <span className="block text-balance">Offices will have bad days.</span>
              <span className="block text-balance text-geru-600">You decide what's there to take.</span>
            </h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">The office doesn't have to be perfect. Three choices you make before sending decide what Breach Day can expose.</p>
          </div>
          <ul className="grid gap-6 sm:grid-cols-3">
            {CONTROLS.map((c) => (
              <li key={c.title}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-neel-600">
                  <Icon name={c.icon} className="h-[18px] w-[18px]" />
                </span>
                <h3 className="mt-3 text-[16.5px] font-semibold text-ink">{c.title}</h3>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{c.body}</p>
                {c.to && (
                  <Link to={c.to} className="mt-2 inline-flex items-center gap-1 text-[14.5px] font-medium text-neel-700 hover:underline">
                    {c.cta} <Icon name="arrow" className="h-4 w-4" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="mt-8 text-center text-[12.5px] leading-relaxed text-ink-3">
        Staged with fictional people, companies and numbers; every document is SAMPLE data. SSNs come from the 987-65-4320 to 987-65-4329 range reserved for advertising. This
        page makes no network calls.
      </p>
    </Layout>
  );
}
