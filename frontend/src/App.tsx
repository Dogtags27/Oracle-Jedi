import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Button, Card, PqTag } from "./components/ui";
import { api } from "./lib/api";
import OfficePage from "./pages/Office";
import RequestPage from "./pages/Request";
import CheckPage from "./pages/Check";

function Home() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => {
    api<{ ok: boolean }>("/health")
      .then((r) => setStatus(r.ok ? "online" : "offline"))
      .catch(() => setStatus("offline"));
  }, []);
  return (
    <Layout>
      <section className="py-10">
        <PqTag />
        <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl">
          AI can fake the message.
          <br />
          <span className="text-saber">It can't fake the office's website.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-300">
          Check who's asking. Send only what they need. Seal it so it never sits readable in an inbox again.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/office">
            <Button variant="saber">I'm an office · request documents</Button>
          </Link>
          <Link to="/breach-day">
            <Button variant="ghost">See Breach Day</Button>
          </Link>
        </div>
        <p className="mt-6 text-xs text-slate-500">API {status}</p>
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
      <Route path="/h/:id" element={<Placeholder title="Personal handoff" />} />
      <Route path="/breach-day" element={<Placeholder title="Breach Day" />} />
      <Route path="*" element={<Placeholder title="Not found" />} />
    </Routes>
  );
}
