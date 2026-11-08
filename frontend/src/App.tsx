import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { Tip, useT } from "@oj/core/i18n/react";
import { Layout } from "./components/Layout";
import { HeroCarousel } from "./components/HeroCarousel";
import { Card, Icon, PqTag, buttonClass, rich, type IconName } from "./components/ui";
import { api } from "./lib/api";
import { HOME } from "./locales/home";
import OfficePage from "./pages/Office";
import RequestPage from "./pages/Request";
import CheckPage from "./pages/Check";
import HandoffPage from "./pages/Handoff";
import BreachDayPage from "./pages/BreachDay";
import SentPage from "./pages/Sent";

const STEPS: { n: string; key: "step1" | "step2" | "step3"; icon: IconName }[] = [
  { n: "01", key: "step1", icon: "eye" },
  { n: "02", key: "step2", icon: "scissors" },
  { n: "03", key: "step3", icon: "lock" },
];

const GUARDS = ["guard1", "guard2", "guard3"] as const;

function Home() {
  const t = useT(HOME);
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
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-geru-600">{t("kicker")}</p>
          <h1 className="mt-4 text-[42px] font-semibold leading-[1.08] text-ink sm:text-[54px]">
            {t("h1.a")}
            <br />
            {t("h1.b")}
          </h1>
          <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-ink-2">{t("lede")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Tip text={t("cta.office.tip")}>
              <Link to="/office" className={buttonClass("primary")}>
                {t("cta.office")}
              </Link>
            </Tip>
            <Link to="/check" className={buttonClass("ghost")}>
              {t("cta.check")}
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-[13.5px] text-ink-3">
            <PqTag />
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status === "online" ? "bg-neem-500" : status === "offline" ? "bg-geru-500" : "bg-haldi-500"}`} />
              {t(`service.${status}`)}
            </span>
          </div>
        </div>
        <HeroCarousel />
      </section>

      <section className="mt-16 border-t border-line pt-12">
        <h2 className="text-[26px] font-semibold text-ink">{t("how.title")}</h2>
        <div className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n}>
              <div className="flex items-center gap-3">
                <span className="font-display text-[28px] font-semibold text-geru-500">{s.n}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-neel-600">
                  <Icon name={s.icon} className="h-[18px] w-[18px]" />
                </span>
              </div>
              <h3 className="mt-3 text-[18px] font-semibold text-ink">{t(`${s.key}.title`)}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t(`${s.key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-2xl border border-line bg-card p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-[26px] font-semibold text-ink">{t("browser.title")}</h2>
            <p className="mt-1 text-[15px] text-ink-3">{t("browser.lede")}</p>
          </div>
          <Tip text={t("browser.breach.tip")}>
            <Link to="/breach-day" className="inline-flex items-center gap-1.5 text-[15px] font-medium text-neel-700 hover:underline">
              {t("browser.breach")} <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </Tip>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {GUARDS.map((g) => (
            <div key={g} className="border-l-2 border-neel-200 pl-4">
              <h3 className="text-[16.5px] font-semibold text-ink">{t(`${g}.title`)}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{t(`${g}.body`)}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-6">
          <Tip text={t("download.tip")}>
            <a href="/download/avaran-0.1.0-chrome.zip" download className={buttonClass("primary")}>
              {t("download")}
            </a>
          </Tip>
          <p className="max-w-xl text-[13.5px] leading-relaxed text-ink-3">
            {rich(t("install"), { code: (c) => <span className="font-mono text-ink-2">{c}</span> })}
          </p>
          <Tip text={t("demo.tip")}>
            <a href="/playground/click-guard.html" className="text-[14px] font-medium text-neel-700 hover:underline">
              {t("demo")}
            </a>
          </Tip>
        </div>
      </section>
    </Layout>
  );
}

function Placeholder() {
  const t = useT(HOME);
  return (
    <Layout>
      <Card title={t("notFound")}>{t("notFound.body")}</Card>
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
      <Route path="*" element={<Placeholder />} />
    </Routes>
  );
}
