import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { COMMON, type TranslatorFor } from "@oj/core/i18n";
import { Tip, TipIcon, useFormat, useT } from "@oj/core/i18n/react";
import { Layout } from "../components/Layout";
import { Badge, Button, Icon, PqTag, Spinner, rich, type IconName } from "../components/ui";
import { BREACH_DAY } from "../locales/breachDay";

type Phase = "idle" | "running" | "done";
type Side = "left" | "right";
type Fate = "expired" | "revoked" | "cipher" | "key";
type TileState = "idle" | "current" | "out";
type BT = TranslatorFor<typeof BREACH_DAY>;

interface Ctx {
  t: BT;
  usd: (n: number, cents?: boolean) => string;
  dob: (y: number, m: number, d: number, shortYear?: boolean) => string;
}

interface Doc {
  id: string;
  label: (x: Ctx) => string;
  title: (x: Ctx) => string;
  size: [number, "KB" | "MB"];
  date: [number, number];
  key: (x: Ctx) => string;
  snippet: (x: Ctx) => string;
  ssns: string[];
  accounts: string[];
  fate: Fate;
}

interface DocText {
  id: string;
  label: string;
  title: string;
  date: string;
  meta: string;
  key: string;
  snippet: string;
  fate: Fate;
}

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const DANA = "987-65-4321";
const SAM = "987-65-4322";
const AVA = "987-65-4323";
const LEO = "987-65-4324";
const CHECKING = "2208-7781";
const BROKERAGE = "WB-33902";
const MORTGAGE = "HM-55210";
const ADDRESS = "14 Alder Way, Fernvale";
const BRAMBLECREST = "Bramblecrest Credit Union";
const KETTLEBROOK = "Kettlebrook Health Plan";
const WRENFIELD = "Wrenfield Brokerage";

const ssn = (v: string) => `SSN ${v}`;
const agi = (x: Ctx, n: number) => `AGI ${x.usd(n, false)}`;
const acct = (x: Ctx, v: string) => x.t("f.acct", { v });
const join = (...parts: string[]) => parts.join(" · ");
const of = (title: string, org: string) => `${title} · ${org}`;

const DOCS: Doc[] = [
  { id: "w2-dana", label: (x) => x.t("doc.w2.label", { name: "Dana" }), title: (x) => of(x.t("doc.w2.title"), "Copperfinch Freight"), size: [184, "KB"], date: [1, 27], key: () => ssn(DANA), snippet: (x) => join("Dana Whitfield", ssn(DANA), x.t("f.wages", { v: x.usd(84200) })), ssns: [DANA], accounts: [], fate: "expired" },
  { id: "license", label: (x) => x.t("doc.license.label"), title: (x) => x.t("doc.license.title"), size: [2.1, "MB"], date: [1, 27], key: (x) => x.t("f.dob", { v: x.dob(1986, 4, 12) }), snippet: (x) => join("Dana Whitfield", x.t("f.license", { v: "SAMPLE-D482107" }), x.t("f.dob", { v: x.dob(1986, 4, 12) }), ADDRESS), ssns: [], accounts: [], fate: "expired" },
  { id: "ss-dana", label: (x) => x.t("doc.ssCard.label", { name: "Dana" }), title: (x) => of(x.t("doc.ssCard.title"), "Dana"), size: [1.4, "MB"], date: [1, 27], key: () => ssn(DANA), snippet: () => join("DANA M WHITFIELD", DANA), ssns: [DANA], accounts: [], fate: "revoked" },
  { id: "w2-sam", label: (x) => x.t("doc.w2.label", { name: "Sam" }), title: (x) => of(x.t("doc.w2.title"), "Wrenhaven Schools"), size: [176, "KB"], date: [1, 29], key: () => ssn(SAM), snippet: (x) => join("Sam Whitfield", ssn(SAM), x.t("f.wages", { v: x.usd(61450) })), ssns: [SAM], accounts: [], fate: "expired" },
  { id: "stmt-oct", label: (x) => x.t("doc.stmtOct.label"), title: (x) => of(x.t("doc.stmtOct.title"), BRAMBLECREST), size: [412, "KB"], date: [2, 2], key: (x) => acct(x, CHECKING), snippet: (x) => join(acct(x, CHECKING), x.t("f.balance", { v: x.usd(6204.55) }), x.t("f.transactions", { count: 41 })), ssns: [], accounts: [CHECKING], fate: "expired" },
  { id: "1099-int", label: () => "1099-INT", title: (x) => of(x.t("doc.int.title"), BRAMBLECREST), size: [96, "KB"], date: [2, 2], key: () => ssn(DANA), snippet: (x) => join("Dana Whitfield", ssn(DANA), x.t("f.interest", { v: x.usd(312.18) }), acct(x, CHECKING)), ssns: [DANA], accounts: [CHECKING], fate: "cipher" },
  { id: "1095-c", label: (x) => x.t("doc.c1095.label"), title: (x) => of(x.t("doc.c1095.title"), KETTLEBROOK), size: [220, "KB"], date: [2, 4], key: (x) => x.t("f.ssnsListed", { count: 4 }), snippet: () => join(`Dana ${DANA}`, `Sam ${SAM}`, `Ava ${AVA}`, `Leo ${LEO}`), ssns: [DANA, SAM, AVA, LEO], accounts: [], fate: "expired" },
  { id: "1099-div", label: () => "1099-DIV", title: (x) => of(x.t("doc.div.title"), WRENFIELD), size: [88, "KB"], date: [2, 9], key: () => ssn(DANA), snippet: (x) => join("Dana Whitfield", ssn(DANA), x.t("f.dividends", { v: x.usd(1046.9) }), acct(x, BROKERAGE)), ssns: [DANA], accounts: [BROKERAGE], fate: "expired" },
  { id: "1099-b", label: () => "1099-B", title: (x) => of(x.t("doc.b.title"), WRENFIELD), size: [310, "KB"], date: [2, 9], key: (x) => acct(x, BROKERAGE), snippet: (x) => join(acct(x, BROKERAGE), x.t("f.proceeds", { v: x.usd(18320) }), x.t("f.costBasis", { v: x.usd(15940) })), ssns: [], accounts: [BROKERAGE], fate: "key" },
  { id: "1098", label: (x) => x.t("doc.m1098.label"), title: (x) => of(x.t("doc.m1098.title"), "Hollowpine Mortgage"), size: [102, "KB"], date: [2, 10], key: (x) => x.t("f.loan", { v: MORTGAGE }), snippet: (x) => join("Dana Whitfield", ssn(DANA), x.t("f.loan", { v: MORTGAGE }), x.t("f.interest", { v: x.usd(9871.44) })), ssns: [DANA], accounts: [MORTGAGE], fate: "expired" },
  { id: "ss-ava", label: (x) => x.t("doc.ssCard.label", { name: "Ava" }), title: (x) => of(x.t("doc.ssCard.title"), "Ava"), size: [1.2, "MB"], date: [2, 11], key: () => ssn(AVA), snippet: () => join("AVA R WHITFIELD", AVA), ssns: [AVA], accounts: [], fate: "revoked" },
  { id: "daycare", label: (x) => x.t("doc.daycare.label"), title: (x) => of(x.t("doc.daycare.title"), "Fernhollow Daycare"), size: [540, "KB"], date: [2, 11], key: (x) => `Ava ${x.t("f.dob", { v: x.dob(2019, 3, 2, true) })}`, snippet: (x) => join(`Ava Whitfield, ${x.t("f.dob", { v: x.dob(2019, 3, 2) })}`, `Leo Whitfield, ${x.t("f.dob", { v: x.dob(2021, 9, 17) })}`, x.t("f.paid", { v: x.usd(9600) })), ssns: [], accounts: [], fate: "expired" },
  { id: "1098-t", label: (x) => x.t("doc.t1098.label"), title: (x) => of(x.t("doc.t1098.title"), "Saltmarsh College"), size: [74, "KB"], date: [2, 16], key: () => ssn(SAM), snippet: (x) => join("Sam Whitfield", ssn(SAM), x.t("f.tuition", { v: x.usd(7800) })), ssns: [SAM], accounts: [], fate: "cipher" },
  { id: "stmt-nov", label: (x) => x.t("doc.stmtNov.label"), title: (x) => of(x.t("doc.stmtNov.title"), BRAMBLECREST), size: [398, "KB"], date: [2, 16], key: (x) => acct(x, CHECKING), snippet: (x) => join(acct(x, CHECKING), x.t("f.balance", { v: x.usd(5880.12) }), x.t("f.transactions", { count: 38 })), ssns: [], accounts: [CHECKING], fate: "expired" },
  { id: "1099-nec", label: () => "1099-NEC", title: (x) => of(x.t("doc.nec.title"), "Quillhouse Design Studio"), size: [81, "KB"], date: [2, 18], key: () => ssn(DANA), snippet: (x) => join("Dana Whitfield", ssn(DANA), x.t("f.nonemployee", { v: x.usd(4200) })), ssns: [DANA], accounts: [], fate: "key" },
  { id: "passport", label: (x) => x.t("doc.passport.label", { name: "Sam" }), title: (x) => of(x.t("doc.passport.title"), "Sam"), size: [2.6, "MB"], date: [2, 18], key: (x) => x.t("f.dob", { v: x.dob(1984, 11, 30) }), snippet: (x) => join("Sam Whitfield", x.t("f.passport", { v: "SAMPLE-X01984" }), x.t("f.dob", { v: x.dob(1984, 11, 30) })), ssns: [], accounts: [], fate: "revoked" },
  { id: "return-2024", label: (x) => x.t("doc.return.label", { year: "2024" }), title: (x) => x.t("doc.return.title"), size: [1.8, "MB"], date: [2, 23], key: (x) => agi(x, 139880), snippet: (x) => join("Dana & Sam Whitfield", DANA, SAM, agi(x, 139880), x.t("f.refundTo", { v: acct(x, CHECKING) })), ssns: [DANA, SAM], accounts: [CHECKING], fate: "expired" },
  { id: "stmt-dec", label: (x) => x.t("doc.stmtDec.label"), title: (x) => of(x.t("doc.stmtDec.title"), BRAMBLECREST), size: [405, "KB"], date: [2, 23], key: (x) => acct(x, CHECKING), snippet: (x) => join(acct(x, CHECKING), x.t("f.balance", { v: x.usd(7112.9) }), x.t("f.transactions", { count: 44 })), ssns: [], accounts: [CHECKING], fate: "cipher" },
  { id: "ss-leo", label: (x) => x.t("doc.ssCard.label", { name: "Leo" }), title: (x) => of(x.t("doc.ssCard.title"), "Leo"), size: [1.1, "MB"], date: [3, 3], key: () => ssn(LEO), snippet: () => join("LEO J WHITFIELD", LEO), ssns: [LEO], accounts: [], fate: "expired" },
  { id: "5498-sa", label: () => "5498-SA · HSA", title: (x) => of(x.t("doc.hsa.title"), KETTLEBROOK), size: [66, "KB"], date: [3, 3], key: () => ssn(DANA), snippet: (x) => join("Dana Whitfield", ssn(DANA), x.t("f.hsa", { v: x.usd(3850) })), ssns: [DANA], accounts: [], fate: "key" },
  { id: "property-tax", label: (x) => x.t("doc.property.label"), title: (x) => of(x.t("doc.property.title"), "Alder County"), size: [150, "KB"], date: [3, 9], key: () => "14 Alder Way", snippet: (x) => join("Dana & Sam Whitfield", ADDRESS, x.t("f.paid", { v: x.usd(5412) })), ssns: [], accounts: [], fate: "expired" },
  { id: "voided-check", label: (x) => x.t("doc.check.label"), title: (x) => x.t("doc.check.title"), size: [900, "KB"], date: [3, 9], key: (x) => acct(x, CHECKING), snippet: (x) => join("Dana Whitfield", ADDRESS, acct(x, CHECKING)), ssns: [], accounts: [CHECKING], fate: "cipher" },
  { id: "8879", label: (x) => x.t("doc.efile.label"), title: (x) => x.t("doc.efile.title"), size: [130, "KB"], date: [3, 14], key: () => ssn(DANA), snippet: (x) => join("Dana & Sam Whitfield", DANA, SAM, agi(x, 142310), x.t("f.signed")), ssns: [DANA, SAM], accounts: [], fate: "key" },
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

const fateShort = (t: BT, fate: Fate) => t(`fate.${fate}`);
const fateDetail = (t: BT, d: DocText) => (d.fate === "cipher" ? t("fate.cipher.detail", { hex: cipherText(d.id) }) : t(`fate.${d.fate}.detail`));

const FATE_COUNT = DOCS.reduce<Record<Fate, number>>((acc, d) => ({ ...acc, [d.fate]: acc[d.fate] + 1 }), { expired: 0, revoked: 0, cipher: 0, key: 0 });
const SEALED_COUNT = FATE_COUNT.cipher + FATE_COUNT.key;
const ALL_SSNS = new Set(DOCS.flatMap((d) => d.ssns)).size;
const ALL_ACCOUNTS = new Set(DOCS.flatMap((d) => d.accounts)).size;

const STORY = [
  { n: "01", key: "story1" },
  { n: "02", key: "story2" },
  { n: "03", key: "story3" },
] as const;

const REASONS = [
  { id: "expired", count: FATE_COUNT.expired },
  { id: "revoked", count: FATE_COUNT.revoked },
  { id: "sealed", count: SEALED_COUNT },
] as const;

const CONTROLS: { icon: IconName; id: "who" | "what" | "how"; to?: string; cta?: "control.who.cta" | "control.how.cta" }[] = [
  { icon: "eye", id: "who", to: "/check", cta: "control.who.cta" },
  { icon: "scissors", id: "what" },
  { icon: "lock", id: "how", to: "/sent", cta: "control.how.cta" },
];

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

const plain = (s: string) => s.replace(/<\/?\w+>/g, "");

function useDocs(): DocText[] {
  const t = useT(BREACH_DAY);
  const tc = useT(COMMON);
  const fmt = useFormat();
  return useMemo(() => {
    const x: Ctx = {
      t,
      usd: (n, cents = true) => fmt.number(n, { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }),
      dob: (y, m, d, shortYear) => fmt.date(new Date(y, m - 1, d), { year: shortYear ? "2-digit" : "numeric", month: "2-digit", day: "2-digit" }),
    };
    return DOCS.map((d) => {
      const date = fmt.date(new Date(2025, d.date[0] - 1, d.date[1]), { month: "short", day: "numeric" });
      return {
        id: d.id,
        fate: d.fate,
        label: d.label(x),
        title: d.title(x),
        date,
        meta: `${fmt.number(d.size[0])} ${tc(`unit.${d.size[1]}`)} · ${date}`,
        key: d.key(x),
        snippet: d.snippet(x),
      };
    });
  }, [t, tc, fmt]);
}

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

function PaperTile({ doc, state }: { doc: DocText; state: TileState }) {
  const t = useT(BREACH_DAY);
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
          {t("sample")}
        </span>
      )}
      <p className="relative flex items-center gap-1.5 text-sm font-semibold">
        {out ? <Icon name="eye" className="h-3.5 w-3.5 shrink-0 text-geru-600" /> : <ClipIcon className="h-3.5 w-3.5 shrink-0 text-ink-3" />}
        <span className="truncate">{doc.label}</span>
      </p>
      <p className={cx("relative mt-0.5 truncate text-xs", out ? "font-mono font-semibold text-geru-700" : "text-ink-3")}>{out ? doc.key : doc.meta}</p>
    </div>
  );
}

function SealedTile({ doc, state }: { doc: DocText; state: TileState }) {
  const t = useT(BREACH_DAY);
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
      <p className={cx("mt-0.5 truncate text-xs font-medium", out ? "text-neem-700" : "text-ink-3")}>{out ? fateShort(t, doc.fate) : t("tile.sealedLink", { date: doc.date })}</p>
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

function spotlightFor(t: BT, docs: DocText[], side: Side, phase: Phase, step: number): Spot {
  const left = side === "left";
  const doc = phase === "running" && step > 0 ? docs[step - 1] : null;
  if (phase === "idle") {
    return left
      ? { tone: "quiet", eyebrow: t("spot.before"), title: t("spot.idle.left.title", { n: TOTAL }), body: t("spot.idle.left.body") }
      : { tone: "quiet", eyebrow: t("spot.before"), title: t("spot.idle.right.title", { n: TOTAL }), body: t("spot.idle.right.body") };
  }
  if (phase === "done") {
    return left
      ? { tone: "exposed", eyebrow: t("spot.finished", { total: TOTAL }), title: t("spot.done.left.title"), body: t("spot.done.left.body", { ssns: ALL_SSNS, accounts: ALL_ACCOUNTS }) }
      : {
          tone: "safe",
          eyebrow: t("spot.finished", { total: TOTAL }),
          title: t("spot.done.right.title"),
          body: t("spot.done.right.body", { expired: FATE_COUNT.expired, revoked: FATE_COUNT.revoked, sealed: SEALED_COUNT }),
        };
  }
  if (!doc) {
    return { tone: "quiet", eyebrow: t("spot.progress"), title: t("spot.progress.title"), body: left ? t("spot.progress.left") : t("spot.progress.right") };
  }
  return left
    ? { tone: "leak", eyebrow: t("spot.opens", { step, total: TOTAL }), title: doc.title, body: doc.snippet, mono: true }
    : { tone: "sealed", eyebrow: t("spot.opens", { step, total: TOTAL }), title: t("spot.linkTo", { title: doc.title }), body: fateDetail(t, doc), mono: true };
}

function InboxPanel({ side, phase, step, docs }: { side: Side; phase: Phase; step: number; docs: DocText[] }) {
  const t = useT(BREACH_DAY);
  const fmt = useFormat();
  const left = side === "left";
  const live = phase !== "idle";
  const exported = DOCS.slice(0, step);
  const readable = left ? step : 0;
  const ssns = left ? new Set(exported.flatMap((d) => d.ssns)).size : 0;
  const accounts = left ? new Set(exported.flatMap((d) => d.accounts)).size : 0;
  const spot = spotlightFor(t, docs, side, phase, step);
  const current = phase === "running" && step > 0 ? docs[step - 1] : null;
  const sideLabel = left ? t("side.without") : t("side.with");

  const frame = !live ? "border-line" : left ? (phase === "done" ? "border-geru-500" : "border-geru-200") : phase === "done" ? "border-neem-500" : "border-neel-200";

  const badge =
    phase === "idle" ? (
      left ? (
        <Badge tone="slate">
          <ClipIcon className="h-3 w-3" /> {t("badge.attachments", { n: TOTAL })}
        </Badge>
      ) : (
        <Badge tone="blue">
          <Icon name="lock" className="h-3 w-3" /> {t("badge.links", { n: TOTAL })}
        </Badge>
      )
    ) : phase === "running" ? (
      <Badge tone="red">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-geru-600 motion-reduce:animate-none" /> {t("badge.exporting")}
      </Badge>
    ) : left ? (
      <Badge tone="red">{t("badge.allReadable")}</Badge>
    ) : (
      <Badge tone="green">
        <Icon name="check" className="h-3.5 w-3.5" /> {t("badge.noneReadable")}
      </Badge>
    );

  const countTone = !live ? "text-ink-3/60" : left ? "text-geru-600" : "text-neem-600";
  const statTone = (n: number) => (n ? "text-geru-700" : live ? "text-neem-700" : "text-ink");

  return (
    <section aria-label={sideLabel} className={cx("min-w-0 rounded-2xl border-2 bg-card p-5 transition-colors duration-500 sm:p-6", frame)}>
      <div className={cx("flex items-start justify-between gap-4", !left && "lg:flex-row-reverse")}>
        <div className={cx("min-w-0", !left && "lg:text-right")}>
          <div className={cx("flex items-center gap-1.5", !left && "lg:justify-end")}>
            <p className={cx("text-[12.5px] font-semibold uppercase tracking-[0.16em]", left ? "text-geru-600" : "text-neel-700")}>{sideLabel}</p>
            <TipIcon text={left ? t("side.without.tip") : t("side.with.tip")} label={t("side.about", { side: sideLabel })} className={left ? "text-geru-600" : "text-neel-700"} />
          </div>
          <h2 className="mt-1 text-[22px] font-semibold leading-tight text-ink sm:text-[25px]">{left ? t("heading.without") : t("heading.with")}</h2>
          <p className="mt-1 text-[14.5px] leading-snug text-ink-3">{left ? t("sub.without") : t("sub.with")}</p>
          <div className={cx("mt-3 flex", !left && "lg:justify-end")}>{badge}</div>
        </div>
        <div className={cx("shrink-0 text-right", !left && "lg:text-left")}>
          <p
            key={readable}
            className={cx("font-display text-[64px] font-semibold leading-[0.9] tabular-nums transition duration-200 starting:scale-110 motion-reduce:transition-none sm:text-[76px]", countTone)}
          >
            {fmt.number(readable)}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-tight text-ink-2">
            {t("counter.of", { total: TOTAL })}
            <br />
            <span className="font-semibold">{t("counter.readable")}</span>
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
          <span>{rich(t("stat.taken", { step, total: TOTAL }), { b: (c) => <b className="tabular-nums text-ink">{c}</b> })}</span>
          <span>{rich(t("stat.ssns", { n: ssns }), { b: (c) => <b className={cx("tabular-nums", statTone(ssns))}>{c}</b> })}</span>
          <span>{rich(t("stat.accounts", { n: accounts }), { b: (c) => <b className={cx("tabular-nums", statTone(accounts))}>{c}</b> })}</span>
        </div>
      </div>

      <Spotlight
        spot={spot}
        motionKey={`${phase}-${step}`}
        tag={
          left && spot.tone === "leak" ? (
            <span className="rounded border border-geru-600/60 px-1.5 text-[10px] font-bold leading-4 tracking-widest text-geru-700">{t("sample")}</span>
          ) : !left && current ? (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-neem-700">{fateShort(t, current.fate)}</span>
          ) : null
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {docs.map((d, i) => {
          const state: TileState = i >= step ? "idle" : current && i === step - 1 ? "current" : "out";
          return left ? <PaperTile key={d.id} doc={d} state={state} /> : <SealedTile key={d.id} doc={d} state={state} />;
        })}
      </div>

      <p className="mt-4 text-[14px] leading-relaxed text-ink-3">
        {rich(left ? t("note.without") : t("note.with"), { b: (c) => <span className="font-semibold text-ink-2">{c}</span> })}
      </p>
    </section>
  );
}

function Status({ phase, step }: { phase: Phase; step: number }) {
  const t = useT(BREACH_DAY);
  const bold = (c: string) => <span className="font-semibold">{c}</span>;
  if (phase === "idle") {
    return (
      <p className="text-[15px] leading-snug text-ink-2 sm:text-[16px]">
        {rich(t("status.idle", { n: RUN_SECONDS }), {
          b: (c) => <span className="font-semibold text-ink">{c}</span>,
          l: (c) => <span className="hidden sm:inline">{c}</span>,
          s: (c) => <span className="sm:hidden">{c}</span>,
        })}
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
          <span className="hidden sm:inline">{rich(t("status.running", { step, total: TOTAL }), { b: bold, n: (c) => <span className="tabular-nums">{c}</span> })}</span>
          <span className="tabular-nums sm:hidden">
            {rich(t("status.runningShort", { step }), {
              b: bold,
              r: (c) => <b className="text-geru-700">{c}</b>,
              g: (c) => <b className="text-neem-700">{c}</b>,
            })}
          </span>
        </p>
      </div>
    );
  }
  return (
    <p className="text-[15px] leading-snug text-ink sm:text-[17px]">
      {rich(t("status.done", { total: TOTAL }), {
        b: bold,
        r: (c) => <b className="font-display text-[19px] font-semibold tabular-nums text-geru-600 sm:text-[22px]">{c}</b>,
        g: (c) => <b className="font-display text-[19px] font-semibold text-neem-600 sm:text-[22px]">{c}</b>,
      })}
    </p>
  );
}

export default function BreachDayPage() {
  const t = useT(BREACH_DAY);
  const fmt = useFormat();
  const docs = useDocs();
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [wasReset, setWasReset] = useState(false);
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
    setWasReset(false);
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
    setWasReset(true);
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

  const announcement = phase === "running" ? t("live.running") : phase === "done" ? plain(t("status.done", { total: TOTAL })) : wasReset ? t("live.reset") : "";

  return (
    <Layout wide>
      <section className="grid items-start gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <div className="lg:pt-2">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-geru-600">{t("kicker", { n: RUN_SECONDS })}</p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.1] text-ink sm:text-[46px]">
            <span className="block text-balance">{t("h1.a")}</span>
            <span className="block text-balance text-ink-3">{t("h1.b")}</span>
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ink-2 sm:text-[18px]">
            {rich(t("intro"), { b: (c) => <b className="font-semibold text-ink">{c}</b> })}
          </p>
          <p className="mt-4 max-w-xl border-l-2 border-geru-200 pl-4 text-[17px] leading-relaxed text-ink sm:text-[18px]">{t("settled")}</p>
        </div>

        <div className="rounded-2xl border border-line bg-card p-6">
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-ink-3">{t("story.eyebrow")}</p>
          <ol className="mt-4">
            {STORY.map((s, i) => (
              <li key={s.n} className="flex gap-4">
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <span className="font-display text-[22px] font-semibold leading-none text-geru-500">{s.n}</span>
                  {i < STORY.length - 1 && <span aria-hidden className="mt-2 w-px flex-1 bg-line-2" />}
                </div>
                <div className={cx("min-w-0", i < STORY.length - 1 && "pb-5")}>
                  <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-ink-3">{t(`${s.key}.when`)}</p>
                  <h3 className="text-[17px] font-semibold leading-snug text-ink">{t(`${s.key}.title`)}</h3>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{t(`${s.key}.body`, { total: TOTAL })}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div ref={barRef} className="sticky top-2 z-30 mt-10 rounded-xl border border-line-2 bg-card/95 px-4 py-3 shadow-[0_4px_14px_rgba(30,27,23,0.07)] backdrop-blur-sm sm:px-5">
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-64">
            <Status phase={phase} step={step} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {phase === "done" && (
              <Tip text={t("why.tip")}>
                <button type="button" onClick={showWhy} className="mr-1 inline-flex items-center gap-1 whitespace-nowrap text-[15px] font-medium text-neel-700 hover:underline">
                  {t("why")} <Icon name="arrow" className="h-4 w-4 rotate-90" />
                </button>
              </Tip>
            )}
            <Tip text={t("reset.tip")}>
              <Button variant="ghost" className="px-4! py-2.5!" onClick={press(reset)} disabled={phase === "idle"}>
                {t("reset")}
              </Button>
            </Tip>
            <Tip text={t("run.tip")}>
              <Button data-run className="min-w-36 px-5! py-2.5! font-semibold! sm:min-w-44" onClick={press(run)} disabled={phase === "running"}>
                {phase === "running" ? (
                  <>
                    <Spinner /> {t("exporting")}
                  </>
                ) : phase === "done" ? (
                  t("runAgain")
                ) : (
                  t("run")
                )}
              </Button>
            </Tip>
          </div>
        </div>
        <p className="mt-2 hidden text-[12px] text-ink-3 sm:block">{rich(t("keys"), { k: (c) => <Kbd>{c}</Kbd> })}</p>
      </div>

      <div ref={stageRef} className="relative mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <InboxPanel side="left" phase={phase} step={step} docs={docs} />
        <span
          aria-hidden
          className={cx(
            "absolute left-1/2 top-[3.75rem] z-20 hidden h-11 w-11 -translate-x-1/2 place-items-center rounded-full border bg-paper font-display text-[15px] font-semibold transition-colors duration-500 lg:grid",
            phase === "done" ? "border-ink-3 text-ink" : "border-line-2 text-ink-3",
          )}
        >
          {t("vs")}
        </span>
        <InboxPanel side="right" phase={phase} step={step} docs={docs} />
      </div>

      <section id="why" className="mt-16 scroll-mt-28 border-t border-line pt-12">
        <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-geru-600">{t("why.eyebrow")}</p>
        <h2 className="mt-3 text-[26px] font-semibold leading-snug text-ink sm:text-[30px]">{t("why.title")}</h2>
        <p className="mt-3 max-w-3xl text-[16.5px] leading-relaxed text-ink-2">
          {rich(t("why.body", { total: TOTAL }), { n: (c) => <span className="whitespace-nowrap">{c}</span> })}
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {REASONS.map((r) => (
            <div key={r.id} className="rounded-xl border border-line bg-card p-5">
              <p className="flex items-baseline gap-2">
                <span className="font-display text-[38px] font-semibold leading-none text-neem-600 tabular-nums">{fmt.number(r.count)}</span>
                <span className="text-[13.5px] text-ink-3">{t("reason.ofLinks", { total: TOTAL })}</span>
              </p>
              <h3 className="mt-3 text-[17px] font-semibold text-ink">{t(`reason.${r.id}.title`)}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{t(`reason.${r.id}.body`)}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14.5px] text-ink-2">
          <p>{rich(t("pq.q"), { b: (c) => <span className="font-semibold text-ink">{c}</span> })}</p>
          <PqTag />
        </div>
      </section>

      <section className="jaali-soft mt-14 rounded-2xl border border-line bg-paper-2/60 p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.5fr] lg:gap-12">
          <div>
            <h2 className="text-[26px] font-semibold leading-tight text-ink sm:text-[30px]">
              <span className="block text-balance">{t("controls.title.a")}</span>
              <span className="block text-balance text-geru-600">{t("controls.title.b")}</span>
            </h2>
            <p className="mt-3 text-[15.5px] leading-relaxed text-ink-2">{t("controls.body")}</p>
          </div>
          <ul className="grid gap-6 sm:grid-cols-3">
            {CONTROLS.map((c) => (
              <li key={c.id}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-neel-600">
                  <Icon name={c.icon} className="h-[18px] w-[18px]" />
                </span>
                <h3 className="mt-3 text-[16.5px] font-semibold text-ink">{t(`control.${c.id}.title`)}</h3>
                <p className="mt-1 text-[14.5px] leading-relaxed text-ink-2">{t(`control.${c.id}.body`)}</p>
                {c.to && c.cta && (
                  <Link to={c.to} className="mt-2 inline-flex items-center gap-1 text-[14.5px] font-medium text-neel-700 hover:underline">
                    {t(c.cta)} <Icon name="arrow" className="h-4 w-4" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="mt-8 text-center text-[12.5px] leading-relaxed text-ink-3">{t("footnote")}</p>
    </Layout>
  );
}
