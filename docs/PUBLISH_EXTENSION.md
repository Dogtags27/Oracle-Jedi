# Publish the extension: GitHub release now, Chrome Web Store in parallel

Two tracks:

| Track | Who can install | Ready in | Use it for |
|---|---|---|---|
| **A. GitHub release** (zip + "Load unpacked") | Anyone with the link | 5 minutes | Judges today, the Devpost link |
| **B. Chrome Web Store** | Everyone, one click | Review takes hours to several days; broad site access usually means a longer, manual review | "Available on the Chrome Web Store" after the event |

Do both. Track A is what judges use today: **don't wait on the store review.**

Prerequisite for both: the backend and frontend are live (`docs/DEPLOY.md` steps 1 to 3), because the extension is built against the production API URL.

---

## 0. Build the production zip (both tracks)

From the repo root in PowerShell, with your real URLs:

```powershell
$env:WXT_API_BASE_URL     = "https://<your-api-host>/api"
$env:WXT_APP_URL          = "https://<your-app>.vercel.app"
$env:WXT_DOH_RESOLVER_URL = "https://cloudflare-dns.com/dns-query"
npm run zip -w extension
Remove-Item Env:WXT_API_BASE_URL, Env:WXT_APP_URL, Env:WXT_DOH_RESOLVER_URL
Get-Content extension\.output\chrome-mv3\manifest.json | Select-String "localhost"
Get-ChildItem extension\.output\*.zip
```

- The `Select-String "localhost"` line must print **nothing**. If it prints a line, the env vars weren't picked up: run the block again in the same window.
- The zip is `extension\.output\avaran-0.1.0-chrome.zip`.
- Install it once yourself from the unpacked folder `extension\.output\chrome-mv3` and check that the status dot next to Avaran in the side panel header shows the service is online before you publish anything.
- Bump `"version"` in `extension/package.json` (0.1.0 → 0.1.1) before every new store upload. The store rejects a version it has already seen.

---

## Track A. GitHub release (for judges, today)

Web UI:
1. https://github.com/Dogtags27/Oracle-Jedi/releases → **Draft a new release**.
2. **Choose a tag** → type `v0.1.0` → **Create new tag**. Title: `Avaran 0.1.0 (Chrome extension)`.
3. Drag `extension\.output\avaran-0.1.0-chrome.zip` into the assets box.
4. Paste the install steps below as the description → **Publish release**.

Or with the GitHub CLI: `gh release create v0.1.0 extension\.output\avaran-0.1.0-chrome.zip --title "Avaran 0.1.0 (Chrome extension)" --notes "Install steps below"`, then paste the steps below into the release description on GitHub.

Install steps to paste into the release and Devpost:

```
1. Download avaran-0.1.0-chrome.zip and extract it (right-click → Extract All).
2. Open chrome://extensions and turn on Developer mode (top right).
3. Click "Load unpacked" and select the extracted folder (the one with manifest.json).
4. Pin Avaran from the puzzle-piece menu. Click it to open the side panel.
5. Try it: open the Click Guard demo at <APP_URL>/playground/click-guard.html, or start a Google Meet,
   present your screen and open WhatsApp Web or Gmail in another tab.
What it can access and why: https://github.com/Dogtags27/Oracle-Jedi/blob/main/extension/PERMISSIONS.md
Privacy policy: <APP_URL>/privacy.html
```

---

## Track B. Chrome Web Store

### B1. Developer account (10 minutes, one time)

1. Use a Google account with **2-Step Verification** turned on (required). A team account is better than a personal one.
2. Open https://chrome.google.com/webstore/devconsole → accept the agreement → pay the one-time **5 USD** registration fee.
3. **Account** tab: publisher display name `Avaran`, contact email (verify it), and the trader declaration. For a student project that isn't selling anything, choose **non-trader**.
4. New publisher accounts get a limited number of extension slots (two by default). One is enough.

### B2. Upload

1. **New item** → upload `avaran-0.1.0-chrome.zip`. The store now runs an install test on upload; fix anything it reports before going on.
2. Fill in the tabs below, then **Submit for review**.
3. On the submit dialog, untick **Publish automatically after review** if you want to choose the moment yourself.

### B3. Store listing tab

- **Description** (paste):

```
Avaran (आवरण, "a layer" in Sanskrit) is a privacy layer for your browser.

CHECK WHO'S ASKING
Before you send a W-2 or a photo ID, Avaran checks whether the email really comes from the office it claims to be: it compares the sender, links and phone numbers with the office's own website and a DNS record the office publishes. Look-alike links are explained before you click them.

SEAL, DON'T ATTACH
"Seal & Attach" in Gmail trims what the office doesn't need (SSNs, account numbers) and encrypts the file on your device with post-quantum encryption. The email carries only a link. You can revoke it any time, and it expires on its own.

SHEATHE: SCREEN-SHARE PRIVACY
The moment you share your screen in Google Meet, Zoom, Teams, Webex, Jitsi, Whereby, Discord or Slack in the browser, WhatsApp Web and Gmail are blurred: photos, names, previews, messages and what you type. Reveal one chat for the meeting with one click, and hide everything again just as fast. Private view (beta): when you present a single tab, you keep seeing your chats while the meeting gets a veiled copy. Global shortcuts work even while desktop Zoom or Teams has focus.

CLICK GUARD: DECEPTIVE BUTTONS
Fake close buttons, "No thanks" links that redirect, decoy download buttons, invisible links over videos and notification traps. Click Guard outlines the real click area as your pointer gets close, shows where it really goes, and stops the click if you go ahead anyway.

PRIVATE BY DESIGN
No ads, no analytics, no trackers. Sheathe and Click Guard run entirely on your device and send nothing. Every network request the extension makes is listed in its Privacy Ledger. Documents leave your device only after they're encrypted.
```

- **Category:** Make Chrome Yours → **Privacy & Security**. **Language:** English.
- **Store icon:** 128×128: `extension/.output/chrome-mv3/icon/128.png`.
- **Screenshots** (1280×800): `extension/store/1-click-guard.png`, `2-private-view.png`, `3-invisible-link.png`.
- **Small promo tile** (440×280): `extension/store/promo-tile-440x280.png`.
- **Homepage URL:** `APP_URL`. **Support URL:** `https://github.com/Dogtags27/Oracle-Jedi/issues`.

### B4. Privacy practices tab (this is where most rejections come from)

**Single purpose** (paste):
```
Avaran protects the user's privacy and safety in the browser: it verifies who is asking for personal documents, encrypts documents before they are shared, hides private chats and inbox content while the user shares their screen, and warns about deceptive buttons and links.
```

**Permission justifications** (paste one per box):

| Permission | Justification |
|---|---|
| `storage` | Stores the user's settings, the list of sealed files they can revoke, a local log of the extension's own network requests (Privacy Ledger), and the Click Guard block log. Nothing is synced. |
| `sidePanel` | The main interface: check a message or link, seal a file, Sheathe and Click Guard settings, sent files and the Privacy Ledger. |
| `contextMenus` | Right-click items: check a link before opening it, check selected text, sheathe the current page, check the page for deceptive buttons, seal a file. |
| `scripting` | Runs Click Guard and "Sheathe this page" on a tab when the user asks for it, and registers Click Guard on all sites only after the user turns it on and grants the optional permission. Also re-attaches the screen-share blur to already-open WhatsApp and Gmail tabs after install. |
| `activeTab` | Lets the user run "Sheathe this page" or "Check this page for deceptive buttons" on the current tab only, from the right-click menu or a shortcut, without standing access to that site. |
| Host permissions | mail.google.com: shows the sender check card, link warnings and the Seal & Attach button in Gmail. web.whatsapp.com and mail.google.com: blur chats and emails while the user shares their screen. Meeting sites (meet.google.com, zoom.us, teams, webex, jitsi, whereby, discord, slack): detect when the user starts a screen share so the blur turns on before the first frame is shared; nothing is read or sent. Our API host: sends check requests and encrypted files. cloudflare-dns.com: public DNS-over-HTTPS lookup of the office's verification record. Optional all sites: only for Click Guard, requested at runtime when the user turns it on, and it reads links and buttons locally without sending anything. |

**Remote code:** **No, I am not using remote code.** (All code is bundled; the extension pages' CSP is `script-src 'self' 'wasm-unsafe-eval'` for the bundled crypto.)

**Data usage:** tick what is actually sent off the device:
- **Personally identifiable information**: yes (the sender's email address, when the user checks a message).
- **Personal communications**: yes (link domains and phone numbers taken from an email the user checks, and the user's encrypted documents).
- Everything else: no. Click Guard and Sheathe read page content only on the device, which the store doesn't count as collection.

Then tick all three certifications: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy URL:** `APP_URL/privacy.html` (the page is in `frontend/public/privacy.html` and goes live with the frontend).

### B5. Distribution tab

- **Visibility:** **Public** if you want it listed, **Unlisted** if only people with the link should find it. Both go through the same review.
- **Regions:** all.

### B6. After you submit

- Status shows **Pending review**. Expect an email either way. Extensions that run on many sites and use `scripting` often get a longer manual review, so a few days is normal.
- If it's rejected, the email names the policy. The usual fixes: tighten the single-purpose text, or explain a permission better. Change, bump the version, re-upload.
- Once it's live, add the store link to the README and Devpost. Judges can keep using the GitHub zip either way.
- **Every API URL change means a new store version** (the API host is baked into the manifest), so finish the AWS setup before uploading.
