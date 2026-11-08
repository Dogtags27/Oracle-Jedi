# Avaran (HANDOFF): task list

> **Status, Sun ~3:30 AM:** G1–G4 code complete and tested. G5 code complete (Breach Day, evals, privacy assertions).
> - **Tests:** unit 26/26 · API smoke 14/14 · web UI smoke 11/11 · extension E2E 20/20 · privacy (TS6) 9/9. Evals EV1–EV5 are in `evals/results/*.md`. Run everything with `npm run test:all`.
> - **Done since G2:** E1–E9, C6, C7, W5 (Trim, in the vault and on `/r`), W7 `/h/:id`, W8 `/sent`, W9 Breach Day, B10 (in-process purge), B12 (rate limits), TS2, TS6, EV1–EV6, S6/D1 fixtures, E13 docs.
> - **Left, all on people:** S4/I3 domain and demo office ([docs/DEMO_SETUP.md](docs/DEMO_SETUP.md)) · I1/I2 deploy: AWS ECS Express + Vercel ([docs/DEPLOY.md](docs/DEPLOY.md)) · TS5 real-Gmail pass · D2/D3 test inboxes · D4–D7 deck, video, Devpost, rehearsals.
> - **New (Sun ~4:15 AM): Sheathe**, screen-share privacy ([../PLAN_V10_SHEATHE.md](../PLAN_V10_SHEATHE.md)). SH1–SH5 and SH8 are built, and `npm run smoke:sheathe` passes 14/14. SH6 (runtime optional permissions) was replaced by static permissions; SH7 (Slack, Telegram and other adapters) is post-hackathon. WhatsApp's page anchors still need the real-site check at the end.
> - **New (Sun ~5 AM): Click Guard**, which flags and stops deceptive buttons and links (fake Close/Cancel, hidden pop-ups, invisible overlays, scripted redirects, decoy downloads, notification traps). `npm run smoke:guard` passes 14/14. "Guard every site" uses optional `<all_urls>`; "Check this page" uses `activeTab`.
> - **Not built (cut-order stretch):** E10 Upload Guard, E11 Gemini Nano, E12 OCR, K9/K10, W12, I4 screenshot.

> **Design:** `../PLAN_V9_TECH.md` · **Demo:** `../PLAN_V8.md`
>
> **Deadline:** Devpost by **11:00 Sun**. Our targets: **feature freeze 8:30 · video 9:30 · submit 10:15**.
>
> **Owners**
> - **A**: crypto + backend
> - **B**: Check engine + evals
> - **C**: Chrome extension
> - **D**: Trim (redaction) + web UI + demo
>
> **Priority**
> - **MUST**: the demo breaks without it
> - **SHOULD**: makes it stronger
> - **STRETCH**: only if ahead
>
> **Rule:** finish the vertical slice (gate G1) before touching any STRETCH item.
>
> **Repo layout (final):** `core/`, `backend/` (Hono API), `frontend/` (Vite + React), `extension/` (WXT), using npm workspaces.
> - Where this doc says `packages/core`, read `core/`.
> - Where it says `apps/web`, read `backend/` (API) + `frontend/` (UI).
> - Where it says `pnpm`, read `npm`.
> - The env variables are listed in `README.md`.

---

## Timeline (gates)

| Gate | Target | Done when |
|---|---|---|
| **G0 Setup** | ~2:00 | Repo scaffolded, accounts and keys ready, shared contracts agreed, domain bought |
| **G1 Vertical slice** | ~5:00 | Request link → PQ seal → office decrypts → revoke disappears live |
| **G2 Check** | ~5:00 | `/api/check` returns Verified / Doesn't match / Unknown with verified quotes in under 5 s |
| **G3 Gmail** | ~6:30 | "Who's asking?" card + Seal & Attach work on real Gmail |
| **G4 Trim** | ~6:30 | Real (flattened) redaction + re-scan proof, works with wifi off |
| **G5 Demo-ready** | 8:30 | Breach Day seeded, evals run, 3 clean rehearsals |

---

## 0. Setup and foundations (everyone, first ~45 min)

| ID | Task | Owner | Pri | Est | Done when |
|---|---|---|---|---|---|
| S1 | Monorepo scaffold: pnpm workspaces, TypeScript, ESLint/Prettier, Vitest; `packages/core`, `apps/web` (Next.js), `apps/extension` (WXT + React) | A | MUST | 30m | `pnpm dev` runs the web app; the extension loads unpacked |
| S2 | `.gitignore` (all `.env*` except `.env.example`), per-app `.env.example`, README dev instructions | A | MUST | 10m | No secret can be committed by accident |
| S3 | Accounts and keys: Supabase, Tavily, Exa, Vercel, InboxSDK app ID (see **Env** below) | You | MUST | 20m | Keys are in local `.env` files, not in chat or git |
| S4 | **Buy a demo-office domain** ("Maple Street Tax") with DNS on Cloudflare, plus an optional app domain | You | MUST | 15m | We can add a DNS TXT record and serve `/.well-known/handoff.json` |
| S5 | Shared contracts in `packages/core/types`: `Header`, `Meta`, `Finding`, `OfficeKeyBundle`, `CheckRequest/Response`, API request/response shapes | A+B+C | MUST | 20m | Everyone codes against the same types |
| S6 | Demo fixtures: fake W-2, bank statement and ID using SSA's advertising SSNs (987-65-4320 to 4329) | D | MUST | 30m | 3–5 sample PDFs and images in `fixtures/` |

## 1. `packages/core`: crypto and detection (shared by web and extension)

| ID | Task | Owner | Pri | Est | Depends | Done when |
|---|---|---|---|---|---|---|
| C1 | PQ envelope: X-Wing (`ml_kem768_x25519`) encapsulate/decapsulate, HKDF key derivation, chunked AES-256-GCM, size padding, encrypted metadata chunk → `sealToOffice` / `openSealed` | A | MUST | 90m | S5 | Round-trip test passes; tampering is rejected |
| C2 | Person mode: K1⊕K2 key split → `sealForPerson` | A | SHOULD | 30m | C1 | Round-trip with both halves; fails with either half alone |
| C3 | Office key bundle: generate X-Wing and ML-DSA-65 keys, canonical JSON, self-signature, fingerprint, **6 safety words**, `verifyBundle(bundle, dnsFp)` | A | MUST | 45m | S5 | Sign/verify test passes; fingerprint is stable |
| C4 | Office key at rest: Argon2id wrap/unwrap (`hash-wasm`), recovery kit export/import | A | MUST | 30m | C3 | Wrong passphrase is rejected; the kit restores the keys |
| C5 | Receipts: ML-DSA sign/verify helpers; hash-chain helper for events | A | SHOULD | 20m | C3 | Receipt verifies; a broken chain is detected |
| C6 | Detectors: SSN (+`SAMPLE` tag), ITIN, EIN, routing number (ABA checksum), card number (Luhn), account number, date of birth, passport MRZ, email, phone. Returns positions | D | MUST | 60m | S5 | Fixture tests pass (see EV2) |
| C7 | Request detector + extractor: "does this email ask for documents?" plus claimed organization, sender domain, link domains, phone numbers (rules only) | B | MUST | 40m | S5 | Works on 10 sample emails |

## 2. Backend: `apps/web` API + Supabase

| ID | Task | Owner | Pri | Est | Depends | Done when |
|---|---|---|---|---|---|---|
| B1 | Supabase schema migration: `offices`, `office_keys`, `requests`, `handoffs`, `handoff_events`, `check_cache`; **row-level security on every table**; private bucket `ciphertext`; Realtime enabled on `handoff_events` | A | MUST | 40m | S3 | Migration applies cleanly; anonymous users can't read any table |
| B2 | Supabase clients: server (service role) + browser (anon); office auth (email+password for the demo, magic link optional) | A | MUST | 20m | B1 | Office can sign in |
| B3 | `POST /api/handoffs`: create a handoff, return a signed upload URL, store the revoke-token hash | A | MUST | 30m | B1 | Client can upload ciphertext |
| B4 | `POST /api/handoffs/:id/finalize`: store header, size and hash; issue an ML-DSA **storage receipt**; write an event | A | MUST | 30m | B3, C5 | Receipt verifies on the client |
| B5 | `GET /api/handoffs/:id`: header + signed download URL (office session, or capability in person mode); **expired → 410** | A | MUST | 20m | B3 | Office can download ciphertext |
| B6 | `POST /api/handoffs/:id/k2`: code check, 5 attempts, then burn | A | SHOULD | 20m | C2 | Wrong code ×5 → gone |
| B7 | `DELETE /api/handoffs/:id`: revoke (delete blob and K2) + realtime event | A | MUST | 20m | B3 | Dashboard item disappears live |
| B8 | Office endpoints: register office, publish key bundle, **domain verification via DNS TXT** (DNS-over-HTTPS lookup), `GET /api/offices/:domain/key` | A | MUST | 45m | B1, C3 | Maple Street Tax shows as verified |
| B9 | Requests: create (checklist + expiry), get | A | MUST | 20m | B1 | Request link works |
| B10 | Expiry: enforced on every read (always correct) + purge job (`pg_cron` → `pg_net` → `/api/cron/purge` with `CRON_SECRET`). Deleting `storage.objects` rows in SQL **doesn't** delete the files, so purge through the Storage API | A | SHOULD | 30m | B3 | A 2-minute expiry visibly expires in the demo |
| B11 | Server ML-DSA key: a script generates it once and stores it in env; public key exposed at `/api/server-key` | A | MUST | 15m | C3 | Receipts verify against it |
| B12 | Hardening: strict CSP and no third-party scripts on `/r` and `/h`; `Referrer-Policy: no-referrer`; `Cache-Control: no-store`; basic rate limit on `/api/check` and `/k2`; **never log request bodies** | A | SHOULD | 30m | — | Headers present (TS6) |

## 3. Check engine (`/api/check`)

| ID | Task | Owner | Pri | Est | Depends | Done when |
|---|---|---|---|---|---|---|
| K1 | Route skeleton: input validation (zod), **5-second total budget**, partial results → Unknown | B | MUST | 20m | S5 | Returns a valid shape under timeout |
| K2 | Registry fast path: sender domain ∈ verified offices → Verified (registry) | B | MUST | 15m | B8 | Instant verdict for Maple Street Tax |
| K3 | Cache (24 h) in `check_cache` | B | SHOULD | 15m | B1 | A second call is under 200 ms |
| K4 | Exa: discover the official site → candidate domains | B | MUST | 40m | S3 | Finds the right domain for most organizations in the eval set |
| K5 | Tavily Extract: official contact and about pages (by URL; works even for unindexed sites) | B | MUST | 30m | S3 | Page text retrieved |
| K6 | Deterministic match: registrable domains (`tldts`), phone numbers (`libphonenumber-js`), the "office lists a Gmail address" case | B | MUST | 30m | K5 | Unit tests pass |
| K7 | Quote verification: re-fetch the page, confirm an exact substring; no verified quote → no claim | B | MUST | 30m | K5 | Every evidence item has `verified: true` |
| K8 | Verdict rules + template explanation (no LLM) + official upload URL and phone | B | MUST | 30m | K6, K7 | All 3 verdicts reproducible |
| K9 | "What do they actually need?": official checklist search → Trim suggestions | B | STRETCH | 45m | K8 | Cited suggestions show in Trim |
| K10 | "I already sent it": verified official recovery links (IRS IP PIN, credit freeze, FTC) | B | STRETCH | 30m | K7 | Cited checklist |

> ⚠️ **Known risk:** a brand-new demo domain **won't be in Exa's or Tavily's search index** tonight.
> - **Mitigation for the live demo:** the registry supplies Maple Street Tax's official domain, and Tavily Extract fetches its contact page *by URL* (no index needed), so the verified quotes still work live.
> - **Showing Exa discovery:** use the eval set of real public organizations. We only *check* those organizations; we never imitate them.

## 4. Web frontend (`apps/web`)

| ID | Task | Owner | Pri | Est | Depends | Done when |
|---|---|---|---|---|---|---|
| W1 | App shell: Tailwind + shadcn/ui, Avaran branding | D | MUST | 30m | S1 | Shared layout and components |
| W2 | Office onboarding: sign in → generate keys (passphrase) → download recovery kit → DNS TXT instructions → verified badge + safety words | D+A | MUST | 60m | B8, C3, C4 | Maple Street Tax onboarded end to end |
| W3 | Request builder: checklist + expiry → link + QR code | D | MUST | 30m | B9 | Shareable link and QR |
| W4 | Client page `/r/:id`: verified badge + safety words → add documents → **Trim** → **Seal** → receipt; revoke token saved locally | D | MUST | 60m | C1, B3, B4 | Judge can do it from a phone |
| W5 | **Trim component** (shared with the extension): pdf.js render, highlight findings, confirm, **flatten to images (pdf-lib)**, re-scan → "Verified redacted ✓" | D | MUST | 90m | C6 | Output PDF has no selectable sensitive text |
| W6 | Office dashboard: unlock keys, sealed inbox (**Realtime**), decrypt/view/download, signed open receipt, status, expiry countdown | D+A | MUST | 60m | B5, B7, C1 | Live arrivals and revokes |
| W7 | Person-mode page `/h/:id`: code entry → decrypt → view | D | SHOULD | 30m | B6, C2 | Works with a texted code |
| W8 | Sender "My handoffs" page: status + revoke (for users without the extension) | D | SHOULD | 20m | B7 | Revoke from a phone |
| W9 | **Breach Day** split-screen demo page (staged; counters 23 vs 0) | D | MUST | 45m | D2 | Looks great on a projector |
| W10 | Privacy Ledger component (shared) | C | MUST | 20m | E2 | Every call is listed |
| W11 | Landing page: what it is, install the extension, QR code | D | SHOULD | 30m | — | |
| W12 | Safeguards compliance report export | D | STRETCH | 30m | B10 | PDF/JSON export |

## 5. Chrome extension (`apps/extension`, MV3)

| ID | Task | Owner | Pri | Est | Depends | Done when |
|---|---|---|---|---|---|---|
| E1 | WXT scaffold; manifest: `storage`, `sidePanel`, `contextMenus`; hosts: `mail.google.com` + our API; `externally_connectable: none`; CSP allows WebAssembly | C | MUST | 30m | S1 | Loads unpacked, no errors |
| E2 | `apiFetch()` wrapper (the only way to call the network) + ledger store (IndexedDB) | C | MUST | 30m | E1 | Ledger lists every call with a payload preview |
| E3 | **`vault.html` enclave:** file picker, Trim (W5), Seal (C1), direct upload; `postMessage` protocol with strict origin checks + `MessageChannel` | C | MUST | 60m | C1, W5 | **Gmail's page never sees the file** |
| E4 | Gmail integration: InboxSDK (**45-minute timebox**) → fallback to DOM selectors | C | MUST | 45m | E1, S3 | Message and compose hooks fire |
| E5 | Gmail message view: C7 detector → **"Who's asking?" card** → `/api/check` → verdict + clickable evidence + official channel | C | MUST | 60m | E4, K8 | Works on the labeled training sample + the real request |
| E6 | Gmail compose: **Seal & Attach** → vault modal → insert link at cursor | C | MUST | 45m | E3, E4 | The sent email contains only a link |
| E7 | Side panel: seal anything → copy link · check pasted text · My handoffs (revoke) · ledger | C | MUST | 60m | E2, E3 | Works on any site (WhatsApp Web, Slack…) |
| E8 | Right-click menus: "Check who's asking" (selected text), "Seal a file with HANDOFF" | C | SHOULD | 20m | E7 | |
| E9 | DNS-over-HTTPS fingerprint check **inside the extension** (doesn't trust our server) | C | SHOULD | 20m | C3 | Bundle verified independently |
| E10 | Upload Guard (optional `<all_urls>` permission, warn only) | C | STRETCH | 45m | E3 | Banner on a sensitive upload |
| E11 | Gemini Nano (optional): document type + "what does it ask for", with rules fallback | C | STRETCH | 45m | C7 | Degrades gracefully when unavailable |
| E12 | OCR with tesseract.js (bundled `eng.traineddata`) for photos and scans | D | STRETCH | 45m | W5 | Works offline on a phone photo of an ID |
| E13 | Packaging: release zip, install steps, one-page permissions explainer | C | MUST | 20m | E1 | A judge can install it in 2 minutes |

## 6. Infrastructure and deploy

| ID | Task | Owner | Pri | Est | Done when |
|---|---|---|---|---|---|
| I1 | Vercel project linked to the GitHub repo; env vars set; production deploy | A | MUST | 20m | Live URL works |
| I2 | Supabase production config: auth site URL and redirects, storage CORS, `pg_cron` + `pg_net` enabled | A | MUST | 15m | |
| I3 | Demo office site on the Maple Street Tax domain: home + contact page + `/.well-known/handoff.json` + DNS TXT `_handoff` | D+A | MUST | 30m | Tavily Extract can fetch it; the registry verifies it |
| I4 | App custom domain behind Cloudflare → confirm **X25519MLKEM768** in Chrome DevTools → Security | A | SHOULD | 20m | Screenshot for the slide |

## 7. Testing

| ID | Task | Owner | Pri | Done when |
|---|---|---|---|---|
| TS1 | Core unit tests (Vitest): round-trip in both modes, **tamper**, **truncation**, wrong key, header swap; bundle sign/verify; fingerprint stability; Argon2 wrap | A | MUST | All green |
| TS2 | Detector fixture tests (expected findings per document) | D | MUST | All green |
| TS3 | API integration tests: create → upload → finalize → get → revoke; expired → 410; k2 burn | A | SHOULD | All green |
| TS4 | Playwright end to end: request → seal → office decrypt → revoke disappears live | D | SHOULD | Passes 3 times in a row |
| TS5 | Extension manual script on real Gmail (card, compose, side panel, ledger). **Run it 3 times before recording.** | C | MUST | Signed off |
| TS6 | **Privacy assertions (automated):** intercept every outbound request in the e2e run → no body contains SSN, routing-number or account patterns; uploads look like random data (high entropy); `/r` and `/h` load zero third-party scripts; security headers present | A | MUST | All green; becomes a slide |

## 8. Evals ("measured, not claimed": FuzionX likes numbers)

| ID | Eval | Owner | Pri | Metric → target |
|---|---|---|---|---|
| EV1 | **Check engine** golden set (~20 cases: real public organizations verified; fictional mismatched sender domains; tiny office with a Gmail address; no website → Unknown) | B | MUST | Verdict accuracy · **false "Verified" = 0** · citation validity (quote present on re-fetch) = **100%** · latency p50/p95 · API calls per check |
| EV2 | **Detector** precision and recall per data type on ~30 synthetic documents + benign documents (false positives) | D | MUST | Recall ≥ 95% on SSN, routing and card numbers; precision reported |
| EV3 | **Redaction**: text extracted from the output PDF contains none of the target strings | D | MUST | 0 leaks |
| EV4 | **Request detector** on ~30 emails (asks for documents vs not) | B | SHOULD | Precision/recall reported |
| EV5 | **Crypto performance** in Chrome: seal/open time for 1 MB and 10 MB; size overhead | A | SHOULD | Numbers on a slide |
| EV6 | **Egress budget** per flow, from the ledger: requests and bytes sent; confirm only organization names/domains + ciphertext ever leave | C | MUST | A table for the Privacy slide |

> One script per eval (`pnpm eval:check`, `pnpm eval:detect`…) writes `evals/results/*.json` plus a markdown table we paste into the deck.

## 9. Demo and submission

| ID | Task | Owner | Pri |
|---|---|---|---|
| D1 | Fake documents (W-2, bank statement, ID) with SAMPLE SSNs: printed and as QR cards | D | MUST |
| D2 | Two test Gmail accounts; seed the **Breach Day** inboxes (attachments vs HANDOFF links) | D | MUST |
| D3 | A labeled **training-sample** request email in *our own* test inbox (fictional office, no real brands) | D | MUST |
| D4 | Deck: problem → product → demo → privacy proof → **measured evals** → startup → real vs mocked → roadmap | D | MUST |
| D5 | 3–5 minute video (script in PLAN_V8 §3), optional Gradium tutorial voiceover | D | MUST |
| D6 | Devpost write-up, screenshots, README with install steps | D | MUST |
| D7 | Three full rehearsals, including the wifi-off moment and the live revoke | All | MUST |

## Cut order if time runs short
Cut from the top first:
1. E10 Upload Guard
2. E11 Gemini Nano
3. E12 OCR
4. K9/K10
5. Person mode (C2/B6/W7)
6. W12

**Never cut:** C1, C3, K2–K8, B7 + Realtime, E2 Ledger, E5/E6, W5, TS6, EV1.

---

## Environment variables

> **Rules**
> - Put real values in local files (`apps/web/.env.local`, `apps/extension/.env`) and in Vercel. **Never in git, never in chat.**
> - **The extension is public code:** anything in its env can be read by anyone, so **no secret keys go in the extension.** Tavily, Exa and Supabase service keys live **only** on the server.

### `apps/web/.env.local` (and Vercel project settings)
| Variable | Secret? | Where it comes from | Used for |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | no | Your Vercel URL or custom domain | Building links and QR codes |
| `NEXT_PUBLIC_SUPABASE_URL` | no | Supabase → Project Settings → API | Clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no (public) | Same page (the "anon" / "publishable" key) | Browser client (protected by row-level security) |
| `SUPABASE_SERVICE_ROLE_KEY` | **YES** | Same page (the "service_role" / "secret" key) | Server routes only |
| `TAVILY_API_KEY` | **YES** | app.tavily.com | Check engine (extract) |
| `EXA_API_KEY` | **YES** | dashboard.exa.ai | Check engine (discovery) |
| `SERVER_MLDSA_SECRET_KEY` | **YES** | **Generated by our script** (`pnpm gen:server-key`) | Signing storage receipts |
| `SERVER_MLDSA_PUBLIC_KEY` | no | Same script | Verifying receipts |
| `CRON_SECRET` | **YES** | Any random 32+ character string | Protects `/api/cron/purge` |
| `DEMO_OFFICE_DOMAIN` | no | The domain you buy (e.g., `maplestreettax.xyz`) | Seeding and demo |
| `DOH_RESOLVER_URL` | no | Default `https://cloudflare-dns.com/dns-query` | DNS TXT verification |
| `CHECK_TIMEOUT_MS` | no | Default `5000` | Check budget |
| `CHECK_CACHE_TTL_HOURS` | no | Default `24` | Check cache |

### `apps/extension/.env` (built into the extension, so public only)
| Variable | Where it comes from | Used for |
|---|---|---|
| `WXT_API_BASE_URL` | Your deployed app URL + `/api` | All extension API calls |
| `WXT_APP_URL` | Your deployed app URL | Links to the dashboard |
| `WXT_INBOXSDK_APP_ID` | inboxsdk.com → register app (free) | Gmail integration |
| `WXT_DOH_RESOLVER_URL` | Default `https://cloudflare-dns.com/dns-query` | Independent fingerprint check |

### Testing only (`.env.test`, never deployed)
| Variable | Purpose |
|---|---|
| `E2E_BASE_URL` | Target for Playwright (local or preview) |
| `TEST_OFFICE_EMAIL` / `TEST_OFFICE_PASSWORD` | Demo office login for e2e |
| `TEST_OFFICE_KEY_PASSPHRASE` | Unlocks the demo office keys in e2e |

### Optional (only if you want me to run database migrations from the terminal)
| Variable | Where |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | The ID in your project URL |
| `SUPABASE_DB_PASSWORD` | Set when creating the project |

> Otherwise I'll give you a `.sql` file to paste into Supabase → SQL Editor.
