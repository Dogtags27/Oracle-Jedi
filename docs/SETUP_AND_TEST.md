# Avaran: set up, run, and test it yourself

This guide gets everything running on your laptop and walks through every feature so you can see it work before deploying. It takes about 15 minutes to set up and 30–45 minutes to test everything. Windows PowerShell commands, run from the repo folder (`Oracle-Jedi\`). The deploy steps live in [DEPLOY.md](DEPLOY.md), and the demo domain in [DEMO_SETUP.md](DEMO_SETUP.md).

---

## Part 1 · One-time setup

### 1.1 What you need
| Thing | Check |
|---|---|
| Node.js 20 or newer | `node -v` (you have 24) |
| Google Chrome | for the extension and the automated browser tests |
| Supabase project | URL + **service role** key (Project Settings → API) |
| Tavily and Exa API keys | app.tavily.com · dashboard.exa.ai |

### 1.2 Install
```powershell
npm install
```

### 1.3 The `.env` file (repo root)
You already have one. Make sure it contains at least these (values come from the sites above; never commit this file):
```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
TAVILY_API_KEY=<key>
EXA_API_KEY=<key>
SERVER_SECRET=<any long random string; keep it stable>
ALLOWED_ORIGINS=http://localhost:5173
PUBLIC_APP_URL=http://localhost:5173
```
Optional: `WXT_API_BASE_URL` / `WXT_APP_URL` (the extension defaults to `http://localhost:8787/api` and `http://localhost:5173`), and `DEMO_OFFICE_DOMAIN` once you have the demo domain.

### 1.4 The database (once)
Supabase → **SQL Editor** → paste all of `backend/supabase/schema.sql` → **Run**. The private storage bucket `ciphertext` is created automatically the first time the backend starts.

### 1.5 Check that the backend is happy
```powershell
npm run dev:backend
```
Open **http://localhost:8787/api/health**. You should see:
```json
{"ok":true,"suite":"HANDOFF-PQ1","configured":{"supabaseUrl":true,"supabaseServiceRole":true,"tavily":true,"exa":true,"serverSecret":true,...},"schema":true,"bucket":true}
```
Any `false` there tells you exactly which key or step is missing.

---

## Part 2 · Run it (three terminals)

| Terminal | Command | Open |
|---|---|---|
| 1 · API | `npm run dev:backend` | http://localhost:8787/api/health |
| 2 · Website | `npm run dev:frontend` | http://localhost:5173 |
| 3 · Extension | `npm run build -w extension` (re-run after code changes) | see below |

**Load the extension into your normal Chrome** (the one logged in to Gmail):
1. Go to `chrome://extensions` → turn on **Developer mode** (top right).
2. **Load unpacked** → choose `Oracle-Jedi\extension\.output\chrome-mv3`.
3. Pin **Avaran** from the puzzle-piece menu. Clicking it opens the side panel.
4. After every rebuild: press the **reload** arrow on the Avaran card, then refresh Gmail or WhatsApp tabs.
5. Optional: `chrome://extensions/shortcuts` shows the shortcuts (Ctrl+Shift+9 Sheathe, Ctrl+Shift+0 panic, Alt+Shift+S sheathe a page, Alt+Shift+G check a page). Change any that clash with your other apps.

**Look inside the backend:**
- `http://localhost:8787/api/server-key`: the server's post-quantum (ML-DSA-65) public key for receipts.
- Supabase → **Table Editor**: `offices`, `requests`, `handoffs` (status changes live), `handoff_events` (hash-chained trail), `check_cache`.
- Supabase → **Storage → ciphertext**: only `ho_….bin` files. Download one: it's random bytes, never a readable document.
- Terminal 1 logs one line per request (method, route, status, time) and never bodies, which is by design.

---

## Part 3 · Try every feature (manual walkthrough)

Use **two windows**: your normal Chrome for the "office", and a **Guest or incognito** window for the "client" (so they have separate storage).

### A. Office → client → sealed document → revoke (the core flow, website only)
1. **Office window:** http://localhost:5173/office → name `Maple Street Tax`, domain e.g. `maplestreettax-test.example`, a passphrase twice → **Generate keys & register**. You land on the dashboard with **safety words** and a DNS record to publish later.
2. Tick **W-2** and **Photo ID** → **Create request link**. You get a link and a QR code.
3. **Client window:** open the link. You should see "Office key signature valid", the checklist and the same safety words.
4. Drop `fixtures/w2-sample.pdf`. The row says *"Contains 1 Social Security number and 1 EIN"* → **Trim**.
5. In Trim, the SSN and EIN are already blacked out. Click **Trim & verify**: *"Verified redacted · no selectable text left · 2/2 boxes solid black · metadata removed"* → **Use trimmed file**.
6. **Seal & send**. The row shows the stages and *"receipt verified"*. The Privacy Ledger at the bottom lists every request; the upload shows as ciphertext.
7. **Office window:** the file appears in **Sealed inbox** within about 2 seconds → **Decrypt**. You see the W-2 with the SSN blacked out and the badge *"Trimmed by sender · verified"*.
8. **Client window:** the item now says **Opened** (signed by the office's key). Click **Revoke**. The office inbox flips to *"Revoked by sender"* live.
9. Try **Self-destruct after 2 minutes (demo)** on another send and watch it expire on both sides.
10. **http://localhost:5173/sent** lists everything sealed from that browser, with revoke.

### B. Check who's asking (website)
http://localhost:5173/check → **Load training sample** → **Check who's asking**. Expect **Unknown** until the demo office's real domain is live (see DEMO_SETUP). The proof and the official channel appear when the office is DNS-verified. The note under the form says exactly what leaves your device.

### C. Breach Day (website, works offline)
http://localhost:5173/breach-day → press **Space** (or the button) to run and **R** to reset. The ending is "23 readable vs 0 readable".

### D. Gmail: "Who's asking?", link guard, Seal & Attach (extension)
1. From a second Gmail account, send yourself the **[TRAINING SAMPLE]** email (text in DEMO_SETUP.md, or the Check page's sample).
2. Open it in Gmail. A card appears above the message: what it asks for (W-2, Photo ID), the pressure cue (Tight deadline), the verdict, and the deceptive link explained.
3. Click the link in the email. The **"Stop. This link isn't what it seems."** dialog shows where it really goes. Choose **Don't open it**.
4. Click **Reply** → in the compose toolbar, next to Send, click **Seal & Attach**. The vault opens over Gmail (Gmail's page can't see inside it).
5. The recipient is a Gmail address, so it's **person mode**: drop `fixtures/w2-sample.pdf` → **Trim** → **Trim & verify** → **Use trimmed file** → **Seal**. You get a **6-digit code**, and only a link is inserted into your reply. Check that the code isn't in the email.
6. Open the link in the Guest window, type the code, and the trimmed W-2 opens. Five wrong codes destroy it.
7. Side panel → **Sent** → **Revoke**. **Ledger** lists every request the extension made.

### E. Side panel on any site (extension)
- **Check:** paste any message or a single link to see what it asks for and any risky links.
- **Seal:** type an office domain you registered in A (e.g. `frontdesk@maplestreettax-test.example`). You'll see the office key signature check, the DNS check (done by your browser itself), and the safety words, which you must confirm until DNS is published. Then seal a file and copy the link.
- Right-click any link → **Check this link before opening**.

### F. Sheathe: screen-share privacy (extension)
1. Open **WhatsApp Web** and **Gmail** in tabs. If they were open before you loaded or reloaded the extension, Avaran now attaches to them on install; refresh them once if anything looks off.
2. Go to **meet.google.com** → start a meeting → **Present now → Entire screen**. The moment the picker opens, the WhatsApp and Gmail tabs are veiled.
3. Switch to WhatsApp: photos, names, previews, messages and what you type are blurred, and the tab title has no unread count. A pill at the bottom offers **Reveal this chat**, **Show 10 s** and **Pause**. Gmail is veiled the same way: senders, subjects, snippets, open emails.
4. Open a harmless chat → **Reveal this chat**: the chat, and its name, photo and preview in the chat list, become visible; every other row stays blurred.
5. Click a different, hidden chat: it opens already blurred, with no flash of its messages.
6. Reveal two chats, then press **Hide all 2 revealed** on the pill (or side panel → Sheathe → **Hide all again**, or ✕ on one name). Everything is blurred again; that's the default.
7. **Stop presenting.** Everything returns after about 3 seconds.
8. Present **a single tab** instead: WhatsApp and Gmail still stay veiled (fail-safe, in case you switch the share to them). The pill says the tab isn't in the share; **Pause** un-veils it for you.
9. **Private view (the "they can't see, you can" mode):** side panel → Sheathe → turn on **Private view when I present a tab**. In Meet, **Present now → A tab → WhatsApp**. On your screen WhatsApp is perfectly readable; Meet's own "you are presenting" preview (and everyone in the call) sees it veiled with "Veiled by Avaran". **Reveal this chat** opens a window in the veil for just that chat. This works for single-tab presenting only. For Entire screen or Window, Sheathe falls back to blurring on your side too.
10. Desktop Zoom or Teams: press **Ctrl+Shift+9** while they're focused, and the same shield comes up. **Ctrl+Shift+0** is panic. Settings are in side panel → **Sheathe**.
11. Any other site: right-click → **Sheathe this page** blurs ID/card/account numbers, emails, phones and round profile photos. Alt+click hides anything else.

> Demo tip for Private view: put the Meet tab and the WhatsApp tab side by side (two windows). Judges see the readable chat on one side and the veiled copy in Meet's presentation preview on the other.

> If WhatsApp shows the whole chat list blurred as one block instead of item by item, that's the safety fallback for an unrecognized layout. Tell us and we'll tune the selectors.

### G. Click Guard: deceptive buttons (extension)
1. Open **http://localhost:5173/playground/click-guard.html** with Click Guard **off**. It is "flickpond", a made-up free-movie site full of real-world tricks. Click the ad's **✕**, **No thanks**, **Download HD**, the video, or **Cancel** under the sign-up box: each one lands on a simulated page showing where that trap really goes (prize scam, card grab, fake installer, fake virus alert, "your email was shared").
2. Side panel → **Guard** → **Guard every site** → accept Chrome's prompt, then reload the demo.
3. Without clicking, move the pointer toward the ad's **✕**: Avaran outlines its real click area and says what it says vs. where it goes. Do the same over the video (the whole invisible link is hatched), the green/orange download buttons, **No thanks** and **Cancel**. Moving away hides the warning; hovering normal controls (nav, Get the app, Skip ad) shows nothing.
4. Click them anyway:
   - **✕** → "Stop: that's not where this button should go"
   - **No thanks** → redirect cancelled
   - **Download (1.4 GB)** direct link → the real file downloads, the extra ad tab is blocked
   - the decoy downloads → asked first
   - clicking plain story text → pop-up blocked (only knowable at click time)
   - **Cancel** in the sign-up box → stopped
   - **Continue** in the robot check → "not allowed", with no browser prompt (only knowable at click time)
   - **Skip ad**, **Unlock HD**, nav and sidebar links → all work normally
5. Prefer not to grant all-site access? Right-click the page → **Check this page for deceptive buttons** (or Alt+Shift+G) checks just that page.
6. Side panel → **Guard** → **Blocked recently** shows the log (stored on your device only). **Turn off** hands the permission back to Chrome.

---

## Part 4 · Automated tests (what we ran)

Keep terminals 1 and 2 running, then:

| Command | What it checks | Time |
|---|---|---|
| `npm test` | 33 unit tests: crypto, detectors, link and click rules | 5 s |
| `npm run smoke` | API end to end against your real Supabase | 20 s |
| `npm run smoke:ui` | Website flow A in a real Chrome, including Trim | 40 s |
| `npm run smoke:ext` | The extension on a Gmail-shaped page (20 steps) | 60 s |
| `npm run smoke:sheathe` | Sheathe with a real screen share (17 steps, incl. no flash on chat switch and Hide all) | 40 s |
| `npm run smoke:veil` | Private view: a real tab share where you see WhatsApp sharp and the meeting's frames are veiled (6 steps) | 20 s |
| `npm run smoke:guard` | Click Guard (16 steps, incl. the hover warning) | 40 s |
| `npm run privacy` | Captures every request and proves no SSN, name or file leaves | 30 s |
| `npm run eval:detect` / `eval:trim` / `eval:check` | The measured numbers for the deck (`evals/results/*.md`). `eval:check` uses Tavily/Exa credits | 1–3 min |
| `npm run test:all` | All of the above except `eval:check` | about 5 min |

Afterwards, remove test offices: `cd backend; npx tsx scripts/cleanup-test-data.ts; cd ..`

---

## Part 5 · If something looks wrong

| Symptom | Fix |
|---|---|
| Website says "Service offline" | Terminal 1 isn't running, or `ALLOWED_ORIGINS` doesn't include `http://localhost:5173` |
| A port is already in use | `netstat -ano \| findstr :8787` (or `:5173`), then `taskkill /PID <pid> /F` |
| Extension changes don't show | Rebuild → reload the Avaran card in `chrome://extensions` → refresh the tab |
| No card on an email | By design it only appears on emails that ask for documents or passwords, or contain risky links or attachments |
| Check always says Unknown | Expected until the demo office's domain and DNS are live. Results are cached for 24 h, so run `cleanup-test-data.ts` to clear |
| Sheathe didn't come on | It needs a meeting **in the browser**; for desktop apps use Ctrl+Shift+9. Check the side panel → Sheathe "Automatically when I share" toggle. Tabs opened before the extension was (re)loaded: refresh them once |
| Private view shows the whole tab veiled to the meeting | Expected for about a second at the start, and whenever WhatsApp hasn't reported in for 3 s (fail-safe). If it stays fully veiled, refresh the WhatsApp tab |
| Meet shows a black or frozen presentation with Private view on | Turn Private view off (side panel → Sheathe) and present again; it uses Chrome's video-processing API, and the normal blur still protects you |
| Click Guard shows nothing | Turn it on (side panel → Guard) and reload the tab, or use right-click → Check this page |
| "office_exists" when registering | That domain already has a key. Restore its recovery kit, or use a new domain |

---

## Part 6 · Before deploying, have these ready
1. **Demo office domain** bought on Cloudflare (DEMO_SETUP.md, steps 1–6).
2. **AWS account** with ECS Express Mode available in your region, and Docker Desktop running (DEPLOY.md §1).
3. **Vercel account** connected to the GitHub repo (DEPLOY.md §2).
4. The same `.env` values for the server. `ALLOWED_ORIGINS` and `PUBLIC_APP_URL` change to your Vercel URL.
5. After both are live: rebuild the extension with `WXT_API_BASE_URL` / `WXT_APP_URL` set to production, reload it, and repeat flows A, D and G against the live site.
