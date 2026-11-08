import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AppI18n } from "./i18n";
import "@fontsource/mukta/400.css";
import "@fontsource/mukta/500.css";
import "@fontsource/mukta/600.css";
import "@fontsource/mukta/700.css";
import "@fontsource/eczar/500.css";
import "@fontsource/eczar/600.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppI18n>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppI18n>
  </StrictMode>,
);
