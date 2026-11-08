import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { HeroCarousel } from "./components/HeroCarousel";
import { Button, Card, Icon, PqTag, type IconName } from "./components/ui";
import { api } from "./lib/api";
import OfficePage from "./pages/Office";
import RequestPage from "./pages/Request";
import CheckPage from "./pages/Check";
import HandoffPage from "./pages/Handoff";
import BreachDayPage from "./pages/BreachDay";
import SentPage from "./pages/Sent";

const STEPS: { n: string; title: string; body: string; icon: IconName }[] = [
  { n: "01", title: "Check who's asking", body: "Before you send anything, Avaran compares the sender with the organization's real website and quotes the proof. Verified, doesn't match, or unknown. Never a guess.", icon: "eye" },
  { n: "02", title: "Send only what's needed", body: "Trim finds Social Security, account and card numbers on your device, blacks out what they didn't ask for, and re-checks the result before it leaves.", icon: "scissors" },
  { n: "03", title: "Seal it, keep control", body: "Files are locked with post-quantum encryption for that one office. Our servers hold ciphertext only. You can revoke it, and it destroys itself on a timer.", icon: "lock" },
];

const GUARDS: { title: string; body: string }[] = [
  { title: "Who's asking, inside Gmail", body: "A quiet card on any email that asks for documents or passwords, with a guard on deceptive links and attachments." },
  { title: "Sheathe while you share", body: "The moment you start sharing your screen, your chats and inbox are veiled. You choose what to reveal." },
  { title: "Click Guard", body: "Buttons that say Close but open somewhere else, hidden pop-ups and invisible layers are stopped, and you see where they lead." },
];

function Home() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => {
    api<{ ok: boolean }>("/health")
      .then((r) => setStatus(r.ok ? "online" : "offline"))
      .catch(() => setStatus("offline"));
  }, []);
  return (
    <Layout wide>
      <section className="grid items-center gap-10 py-4 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-geru-600">Avaran · आवरण · a protective layer</p>
          <h1 className="mt-4 text-[42px] font-semibold leading-[1.08] text-ink sm:text-[54px]">
            Share what's needed.
            <br />
            Keep the rest veiled.
          </h1>
          <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-ink-2">
            AI can fake the message, but not the office's own website. Avaran checks who's asking, trims what they don't need, and seals the rest so nothing
            readable is left sitting in an inbox.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/office">
              <Button>Request documents as an office</Button>
            </Link>
            <Link to="/check">
              <Button variant="ghost">Check a message you received</Button>
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-[13.5px] text-ink-3">
            <PqTag />
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${status === "online" ? "bg-neem-500" : status === "offline" ? "bg-geru-500" : "bg-haldi-500"}`} />
              Service {status}
            </span>
          </div>
        </div>
        <HeroCarousel />
      </section>

      <section className="mt-16 border-t border-line pt-12">
        <h2 className="text-[26px] font-semibold text-ink">How it works</h2>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n}>
              <div className="flex items-center gap-3">
                <span className="font-display text-[28px] font-semibold text-geru-500">{s.n}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-neel-600">
                  <Icon name={s.icon} className="h-[18px] w-[18px]" />
                </span>
              </div>
              <h3 className="mt-3 text-[18px] font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-2xl border border-line bg-card p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[26px] font-semibold text-ink">In your browser</h2>
            <p className="mt-1 text-[15px] text-ink-3">The Avaran extension adds three quiet protections. All of them run on your device.</p>
          </div>
          <Link to="/breach-day" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-neel-700 hover:underline">
            See what a breach exposes <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {GUARDS.map((g) => (
            <div key={g.title} className="border-l-2 border-neel-200 pl-4">
              <h3 className="text-[16.5px] font-semibold text-ink">{g.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{g.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-6">
          <a href="/download/avaran-0.1.0-chrome.zip" download>
            <Button>Download the Chrome extension</Button>
          </a>
          <p className="max-w-xl text-[13.5px] leading-relaxed text-ink-3">
            Unzip it, open <span className="font-mono text-ink-2">chrome://extensions</span>, turn on Developer mode, choose Load unpacked and pick the unzipped folder. Chrome Web Store listing in review.
          </p>
          <a href="/playground/click-guard.html" className="text-[14px] font-medium text-neel-700 hover:underline">
            Try the Click Guard demo
          </a>
        </div>
      </section>
    </Layout>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <Layout>
      <Card title={title}>Coming in a later milestone.</Card>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/office" element={<OfficePage />} />
      <Route path="/check" element={<CheckPage />} />
      <Route path="/r/:id" element={<RequestPage />} />
      <Route path="/h/:id" element={<HandoffPage />} />
      <Route path="/breach-day" element={<BreachDayPage />} />
      <Route path="/sent" element={<SentPage />} />
      <Route path="*" element={<Placeholder title="Not found" />} />
    </Routes>
  );
}
