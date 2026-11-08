import { defineConfig } from "wxt";
import { loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";

const fileEnv = loadEnv(process.env.NODE_ENV === "production" ? "production" : "development", "..", ["WXT_"]);
const origin = (url: string | undefined, fallback: string) => {
  try {
    return new URL(url || fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
};
const apiOrigin = origin(fileEnv.WXT_API_BASE_URL, "http://localhost:8787/api");
const dohOrigin = origin(fileEnv.WXT_DOH_RESOLVER_URL, "https://cloudflare-dns.com/dns-query");

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  zip: { artifactTemplate: "avaran-{{version}}-{{browser}}.zip" },
  hooks: {
    "build:manifestGenerated": (_wxt, manifest) => {
      manifest.host_permissions = (manifest.host_permissions ?? []).filter((host: string) => host !== "<all_urls>");
    },
  },
  vite: () => ({ plugins: [tailwindcss()], envDir: "..", envPrefix: ["WXT_", "VITE_"] }),
  manifest: {
    name: "Avaran",
    description: "Privacy layer for your browser: check who's asking, seal documents, hide chats when screen sharing, stop deceptive buttons.",
    permissions: ["storage", "sidePanel", "contextMenus", "scripting", "activeTab"],
    host_permissions: ["https://mail.google.com/*", "https://web.whatsapp.com/*", `${apiOrigin}/*`, `${dohOrigin}/*`],
    optional_host_permissions: ["<all_urls>"],
    commands: {
      "sheathe-toggle": {
        suggested_key: { default: "Ctrl+Shift+9" },
        description: "Sheathe on/off (works even while Zoom or Teams has focus)",
        global: true,
      },
      "sheathe-panic": {
        suggested_key: { default: "Ctrl+Shift+0" },
        description: "Panic: blur every chat and inbox now",
        global: true,
      },
      "sheathe-tab": {
        suggested_key: { default: "Alt+Shift+S" },
        description: "Sheathe this page: blur personal info on any site",
      },
      "guard-page": {
        suggested_key: { default: "Alt+Shift+G" },
        description: "Click Guard: check this page for deceptive buttons",
      },
    },
    action: { default_title: "Avaran" },
    externally_connectable: { ids: [] },
    web_accessible_resources: [{ resources: ["vault.html"], matches: ["https://mail.google.com/*"] }],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
});
