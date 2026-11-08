# Oracle Jedi

**Check who's asking. Send only what they need. Seal it.**

Oracle Jedi (HANDOFF) is how you send and request sensitive documents without leaving them readable in inboxes. Each document is checked against the requester's real website, trimmed down on your own device, and sealed with post-quantum encryption (`HANDOFF-PQ1`: X-Wing ML-KEM-768 + X25519, ML-DSA-65, AES-256-GCM).

## Monorepo

| Folder | What | Stack |
|---|---|---|
| `core/` | Shared crypto, detectors, types (used by everything) | TypeScript, `@noble/post-quantum`, Vitest |
| `backend/` | API: handoffs, offices, Check engine | Hono on Node, Supabase |
| `frontend/` | Web app: request links, office dashboard, Breach Day | Vite + React + Tailwind |
| `extension/` | Chrome extension: Gmail + side panel | WXT (Manifest V3) + React |

## Quick start

```bash
npm install
npm run dev:backend      # http://localhost:8787/api/health
npm run dev:frontend     # http://localhost:5173
npm run dev:extension    # opens Chrome with the extension loaded
npm test                 # core tests
npm run typecheck        # all workspaces
```

**Database (one time):** paste `backend/supabase/schema.sql` into Supabase → SQL Editor → Run. The private `ciphertext` storage bucket is created automatically.

**End-to-end check:** with the backend running, `npm run smoke -w backend` exercises the full HANDOFF-PQ1 flow against real Supabase.

Load the built extension manually: `npm run build -w extension` → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/.output/chrome-mv3`.

## Environment

Create these files yourself. They're git-ignored. **Never commit them, and never put secret keys in the extension**: anyone can read an extension's code.

The backend reads the repo-root `.env` first, then `backend/.env`. It accepts common aliases (`SUPABASE_SECRET_KEY`, `VITE_SUPABASE_URL`…). The browser never talks to Supabase directly, so no Supabase key is needed in the frontend.

### `backend/.env` (or root `.env`)
```
PORT=8787
ALLOWED_ORIGINS=http://localhost:5173
PUBLIC_APP_URL=http://localhost:5173
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
TAVILY_API_KEY=
EXA_API_KEY=
SERVER_MLDSA_SECRET_KEY=
SERVER_MLDSA_PUBLIC_KEY=
CRON_SECRET=
DEMO_OFFICE_DOMAIN=
DOH_RESOLVER_URL=https://cloudflare-dns.com/dns-query
CHECK_TIMEOUT_MS=5000
CHECK_CACHE_TTL_HOURS=24
```

### `frontend/.env`
```
VITE_API_BASE_URL=http://localhost:8787/api
VITE_APP_URL=http://localhost:5173
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

### `extension/.env`
```
WXT_API_BASE_URL=http://localhost:8787/api
WXT_APP_URL=http://localhost:5173
WXT_INBOXSDK_APP_ID=
WXT_DOH_RESOLVER_URL=https://cloudflare-dns.com/dns-query
```

`GET /api/health` reports which backend services are configured, without revealing any values.

## Privacy rules for contributors
- Plaintext documents exist only in the sender's browser and the recipient's browser. Never on the server.
- The backend never logs request bodies, headers or query strings.
- The extension calls the network only through `apiFetch`, so every call appears in the Privacy Ledger.
- Search providers only ever receive public facts (organization names and domains). Never email bodies or documents.
- No analytics or third-party scripts on request and handoff pages.
