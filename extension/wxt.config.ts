import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({ plugins: [tailwindcss()], envDir: "..", envPrefix: ["WXT_", "VITE_"] }),
  manifest: {
    name: "Oracle Jedi",
    description: "Check who's asking. Send only what they need. Seal it with post-quantum encryption.",
    permissions: ["storage", "sidePanel", "contextMenus"],
    host_permissions: ["https://mail.google.com/*"],
    action: { default_title: "Oracle Jedi" },
    externally_connectable: { ids: [] },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
});
