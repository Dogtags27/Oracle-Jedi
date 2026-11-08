# Avaran

**Check who's asking. Send only what they need. Seal it.**

Avaran (HANDOFF) is how you send and request sensitive documents without leaving them readable in inboxes. Each document/s is checked against the requester's real website, trimmed down on your own device, and sealed with post-quantum encryption (`HANDOFF-PQ1`: X-Wing ML-KEM-768 + X25519, ML-DSA-65, AES-256-GCM).

## Monorepo

| Folder | What | Stack |
|---|---|---|
| `core/` | Shared crypto, detectors, link guard, Trim (redaction) and its UI | TypeScript, `@noble/post-quantum`, pdf.js, pdf-lib, Vitest |
| `backend/` | API: handoffs, offices, Check engine | Hono on Node, Supabase |
| `frontend/` | Web app: request links, office dashboard, `/check`, `/sent`, `/h/:id`, Breach Day | Vite + React + Tailwind |
| `extension/` | Chrome extension: Gmail + side panel | WXT (Manifest V3) + React |
| `fixtures/` | Fake W-2, bank statement, passport page, driver's license, intake notes, benign receipt | All fictional, SAMPLE SSNs only |
| `demo-office/` | Static site for the fictional demo office | Cloudflare Pages |
| `docs/` | **[SETUP_AND_TEST.md](docs/SETUP_AND_TEST.md) (start here: run and test everything locally)** · [DEMO_SETUP.md](docs/DEMO_SETUP.md) (domain, DNS, demo office, Gmail accounts) · [DEPLOY.md](docs/DEPLOY.md) (AWS backend, Vercel frontend, extension zip) | |

## Quick start

```bash
npm install
npm run dev:backend      # http://localhost:8787/api/health
npm run dev:frontend     # http://localhost:5173
npm run dev:extension    # opens Chrome with the extension loaded
npm test                 # core unit tests
npm run typecheck        # all workspaces
```

**Database (one time):** paste `backend/supabase/schema.sql` into Supabase → SQL Editor → Run. The private `ciphertext` storage bucket is created automatically.

Load the built extension manually: `npm run build -w extension` → `chrome://extensions` → Developer mode → **Load unpacked** → `extension/.output/chrome-mv3`. After every rebuild, press the reload icon on the extension card and refresh Gmail.

## Tests and evals

With the backend and frontend dev servers running:

| Command | What it proves |
|---|---|
| `npm test` | Unit tests: crypto round trips and tampering, detectors, link guard, request classifier |
| `npm run smoke` | API end to end against real Supabase: seal, receipt, office decrypt, revoke, person-mode code burn |
| `npm run smoke:ui` | Web flow in Chrome: office setup, request link, **client trims the SSN**, seal, office sees the redacted file, live revoke, Check |
| `npm run smoke:sheathe` | Sheathe in Chrome: a real `getDisplayMedia` share arms the shield before a source is picked; WhatsApp/Gmail fixtures fully blurred; reveal, last-N, fail-closed, tab-share precision, grace period, manual/panic lock, notifications, any-site PII blur, 0 network requests (14 steps) |
| `npm run smoke:guard` | Click Guard in Chrome: 6/6 deceptive controls flagged with 0/6 false flags, fake ✕ / scripted redirect / pop-under / click-anywhere pop-up / form "Cancel" / notification trap all stopped, normal buttons untouched, overlays defused, late "check this page" injection, warning on hover before any click, 0 network requests (16 steps) |
| `npm run smoke:ext` | The real extension in Chrome on a Gmail-shaped page: card, link guard, Seal & Attach with **Trim**, person-mode pickup, side panel, revoke, ledger (20 steps) |
| `npm run privacy` | TS6: captures every request under the app and asserts no SSN/account/routing number, name or filename leaves the device, uploads are random-looking, zero third-party loads, security headers present |
| `npm run eval:detect` | EV2/EV4: detector precision and recall on 60 synthetic documents, request classifier on 27 labeled emails |
| `npm run eval:trim` | EV3/EV5: Trim on 18 documents (independent re-extraction and glyph-coverage check), crypto speed in Chrome |
| `npm run eval:check` | EV1: Check engine golden set with live Exa/Tavily (uses API credits) |
| `npm run fixtures` | Regenerates `fixtures/` |

Results land in `evals/results/*.md`, ready to paste into the deck. Run `cd backend && npx tsx scripts/cleanup-test-data.ts` afterwards to remove test offices.

## Chrome extension: what it protects

| Feature | Where | What it does for the user |
|---|---|---|
| **"Who's asking?" card** | Gmail, on any opened email that asks for documents, passwords or login codes, or carries a dangerous link or attachment | Lists what it asks for and the pressure tactics, then checks the claimed organization against its real website: **Verified / Doesn't match / Unknown**, with quoted proof and the official phone or portal |
| **Link guard** | Gmail | Before a click: link text that lies about the destination, look-alike domains, `@` decoys, punycode, raw IPs, shorteners, free hosting, executable downloads. Risky links are outlined, and clicking one opens a stop screen that offers the official site instead. Runs on-device, sends nothing |
| **Attachment warnings** | Gmail | `.html`, `.exe`, disk images, macro documents, and disguised names like `W2.pdf.exe` |
| **Seal & Attach** | Gmail compose | The file is picked inside an isolated extension vault, so **Gmail's page never sees it**. The vault verifies the office key itself (ML-DSA signature plus its own DNS-over-HTTPS lookup), seals, uploads ciphertext, and inserts only a link. Offices with an unverified domain need the safety words confirmed. If the conversation failed the check, sealing is blocked until the user overrides |
| **Person mode** | Any recipient | The link holds half the key and a 6-digit code (shown only in the vault, never put in the email) releases the other half once; 5 wrong tries destroy the file |
| **Side panel** | Every site | Check pasted text or links · Seal anything and copy the link · Sent (status and revoke) · Privacy Ledger |
| **Right-click** | Every site | "Check this link before opening" · "Check who's asking" on selected text · "Seal a file" |

Permissions: `storage`, `sidePanel`, `contextMenus`, `scripting`, `activeTab`. Hosts: Gmail, WhatsApp Web, our API, the DNS-over-HTTPS resolver, plus the meeting sites where Sheathe's share detector runs. `<all_urls>` is **optional**: requested only when you switch on "Guard every site", and handed back when you switch it off. No `tabs`, and web pages can't message the extension. See [extension/PERMISSIONS.md](extension/PERMISSIONS.md).

## Click Guard: buttons that aren't what they say

Some sites show a "Close", "Cancel" or "No thanks" button that actually opens an ad or malware site, hide a pop-up behind a real "Download", or lay an invisible link over the whole page. Click Guard shows where those controls **really go** and stops them before they fire. All of it runs on your device, and it never visits a link to find out where it goes.

| Trick | What Click Guard does |
|---|---|
| Fake "✕ / Close / Cancel / No thanks / Skip" that opens another site | Outlines it before you click (it reads the label, icon-only classes like `modal-close`, inline `onclick`/`data-href` URLs). Clicking it shows **"Stop: that's not where this button should go"** with the real destination, defaulting to *Stay on this page* |
| A "No thanks" button that redirects by script (`location.href = …`) | Cancelled through Chrome's Navigation API before the page leaves |
| A real "Download" that also opens a pop-under, or clicking plain text that opens a site | The extra pop-up is blocked (the real download still works), with a toast and "Open it anyway" |
| Several "Download" buttons pointing at different sites | The decoys are flagged, and clicking one asks first |
| An invisible link or near-transparent frame covering the page | Found and **defused** (clicks pass through to the real content), shown with a hatch |
| A "Cancel" that submits your form to another site | Stopped, with the destination shown |
| "Click **Allow** to prove you're not a robot" notification traps | The permission request is answered "not allowed" without showing Chrome's prompt |

**How to use it:**
- Side panel → **Guard** → **Guard every site**. Chrome asks for access to all sites at that moment, and it's handed back when you turn it off.
- Or check a single page: right-click → **Check this page for deceptive buttons**, or press **Alt+Shift+G**. That needs no extra permission.
- A pill on each page lists every flagged control with **where it goes**. Blocks are logged in the side panel, on this device only.

**Safety of the warning itself:** the dialog lives in a closed shadow root, so the page can't read or click it. The page can't put its own words in it either: the page-side hook sends only a reason code, and the extension writes the text.

## Sheathe: show only what they need

When you share your screen, Avaran blurs your chats and inbox **before the first frame goes out**:

- **Detects the share:** a page-world hook on Meet, Zoom, Teams, Webex, Jitsi, Whereby, Discord and Slack (in the browser) wraps `getDisplayMedia`. The shield arms when the share **picker opens** (about 5 ms in tests), before you've picked anything. If you cancel, it drops.
- **Knows what you're sharing:** an entire screen or a window sheathes every chat and inbox tab. With a single tab, Chrome's **Capture Handle** tells us whether that tab is WhatsApp or Gmail, so sharing your slides leaves your own WhatsApp tab readable to you.
- **What gets blurred:**
  - **WhatsApp Web:** avatars, chat names, previews and unread badges, the open conversation, media, and what you're typing.
  - **Gmail:** senders, subjects, snippets, avatars, the open email, attachments and compose.
  - **Tab titles** are masked ("(12) WhatsApp" → "WhatsApp") and **notifications** read "New message" with no sender or text.
- **You stay in control:**
  - a pill on the page with **Reveal this chat for this meeting** (remembered per meeting, on this device only), **Show 10 s** and **Pause**;
  - "keep the last N messages visible";
  - **no hover-to-peek**, because the audience would see the peek too.
- **Fails closed:** if WhatsApp or Gmail change their page structure, the whole chat list or pane is blurred instead of missing pieces.
- **Desktop Zoom/Teams** (which a browser can't see): **Ctrl+Shift+9** works even while they have focus, and **Ctrl+Shift+0** is panic.
- **Any other site:** right-click → **Sheathe this page** (or Alt+Shift+S) blurs ID, card, account, routing and phone numbers, emails, dates of birth and round profile pictures, using the same checksum detectors as Trim. Alt+click hides anything else.
- **Zero network:** nothing is sent, and the Privacy Ledger stays empty.

Plan and research: [`../PLAN_V10_SHEATHE.md`](../PLAN_V10_SHEATHE.md).

## Trim: send only what they need

Every file added to Seal & Attach, the side panel or a request link is scanned **on the device** as soon as it's picked: "Contains 1 Social Security number and 1 EIN". **Trim** then:

1. Highlights what it found: SSN (the SSA advertising range is tagged SAMPLE), ITIN, EIN, routing numbers (ABA checksum), card numbers (Luhn), account numbers and dates of birth next to their labels, and passport MRZ lines. Click any box to keep or remove it.
2. Lets you drop whole pages, and draw boxes over anything else. That covers photos and scans, which have no text layer.
3. **Flattens** each kept page to an image with the boxes burned in, so the output PDF has no text layer to copy from. Photos are re-encoded, which strips camera metadata such as GPS. PDF properties (author, title) are dropped.
4. **Re-scans the output**: no selectable text, none of the removed values found again, every box solid black, metadata gone. Only then can you "Use trimmed file", and the office sees "Trimmed by sender · verified".

It all runs in the browser with pdf.js and pdf-lib bundled, so it works offline. Nothing about the document is sent anywhere.

## Measured, not claimed

| What | Result | Source |
|---|---|---|
| Trim: planted values found / leaked after trim | 78/78 found, **0 leaked** on independent re-extraction, 100% of their ink covered | `evals/results/trim.md` |
| Detectors (60 synthetic docs, 30 full of look-alike numbers) | 100% precision, 100% recall after fixing two context bugs the eval found | `evals/results/detect.md` |
| Email classifier (27 labeled emails) | documents: 12/12 caught, 0 false alarms · passwords, codes and payment details: 3/3, 0 false alarms | `evals/results/detect.md` |
| Check engine (17 cases, live) | 17/17 verdicts, **0 false "Verified"**, 13/15 quotes found again by an independent fetch | `evals/results/check.md` |
| Privacy (TS6) | 0 sensitive values in 38 captured requests; upload entropy 7.997 bits/byte; 0 third-party loads | `evals/results/privacy.md` |
| Crypto in Chrome | seal 10 MB in about 20 ms, open in about 20 ms | `evals/results/trim.md` |
| Click Guard | 6/6 deceptive controls flagged, **0/6 false flags**; 7/7 tricks stopped, 5/5 normal actions untouched; **0** network requests | `evals/results/guard.md` |
| Sheathe | shield up **5 ms** after the share picker opens; 23/23 sensitive elements blurred; any-site PII 6/6 caught, 0 false hits; **0** network requests | `evals/results/sheathe.md` |

The synthetic sets are small and we wrote them ourselves, so read them as regression tests, not field accuracy.

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
SERVER_SECRET=
CRON_SECRET=
DEMO_OFFICE_DOMAIN=
DOH_RESOLVER_URL=https://cloudflare-dns.com/dns-query
CHECK_TIMEOUT_MS=5000
CHECK_CACHE_TTL_HOURS=24
```

`SERVER_SECRET` (any long random string) seeds the server's ML-DSA receipt key and the session HMAC. If it's empty, the service-role key is used instead. Keep it stable across deploys, or old receipts stop verifying. `DEMO_OFFICE_DOMAIN` is only read by the Check eval (`npm run eval:check -w backend`). The server purges expired handoffs every minute by itself, so `CRON_SECRET` only matters if you also call `/api/cron/purge` externally.

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
- The extension calls the network only through `apiFetch`, so every call appears in the Privacy Ledger. The Gmail content script makes no network calls itself: it asks the background worker.
- An office's key is locked to its domain once registered. A different key, for recovery or rotation, is accepted only after the domain's DNS TXT publishes the new fingerprint. Keep the recovery kit.
- Rate limits: Check 20/min, pickup codes 10/min (on top of the 5-wrong-codes burn), handoff creation 30/min, office registration and login 10–20/min per IP.
- Search providers only ever receive public facts (organization names and domains). Never email bodies or documents.
- No analytics or third-party scripts on request and handoff pages.
