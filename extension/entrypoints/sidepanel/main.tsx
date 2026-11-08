import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SUITE } from "@oj/core";
import { apiFetch } from "@/lib/api";
import "@/assets/style.css";

function SidePanel() {
  const [status, setStatus] = useState("checking…");
  useEffect(() => {
    apiFetch<{ ok: boolean; suite: string }>("/health")
      .then((r) => setStatus(r.ok ? `backend online · ${r.suite}` : "backend error"))
      .catch(() => setStatus("backend offline"));
  }, []);
  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold text-jedi-400">Oracle Jedi</h1>
      <p className="mt-1 text-sm text-slate-400">Crypto suite: {SUITE}</p>
      <p className="mt-1 text-xs text-slate-500">{status}</p>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
