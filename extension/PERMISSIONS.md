# Avaran extension: what it can access, and why

These are all the permissions. There is no install-time `<all_urls>` (it is optional, see Click Guard below), no `tabs`, no `history`, no `cookies`, no `webRequest`, and no remote code.

## Permissions

| Permission | Why it's needed | What it can't do |
|---|---|---|
| `storage` | Keeps your **Privacy Ledger** (the last 200 network calls the extension made) and your **Sent** list (handoff IDs and revoke tokens, so you can revoke later) on this computer. Session-only storage (cleared when Chrome closes) tells the vault who you are sealing for and which side-panel tab to open | Nothing is synced to a Google account or sent anywhere |
| `sidePanel` | Opens the Avaran side panel: check pasted text or links, seal a file, see Sent and the Ledger | It can't read the page you're on |
| `contextMenus` | Adds four right-click items: "Check this link before opening", "Check who's asking" (on selected text), "Sheathe this page" and "Seal a file with Avaran" | It only gets the link or the text you right-clicked, and only when you choose the item |
| `activeTab` + `scripting` | **Check this page for deceptive buttons** (Click Guard) and **Sheathe this page**: when *you* right-click "Sheathe this page" or press Alt+Shift+S, Chrome lets us run the blur script on that one tab, once | No standing access to any site. It can't run on a page you didn't act on |
| `commands` | Shortcuts: Ctrl+Shift+9 toggles Sheathe and Ctrl+Shift+0 is panic. Both are **global**, so they work while desktop Zoom or Teams has focus. Alt+Shift+S sheathes the current page | A keypress only toggles a local setting. Nothing is sent |

## Sites it can talk to (host permissions)

| Host | Why |
|---|---|
| `https://mail.google.com/*` | Shows the "Who's asking?" card, the link guard and attachment warnings, and adds **Seal & Attach** to compose. The Gmail script makes **no network calls itself**: it asks the background worker, and every call is logged in the Ledger |
| Our API (`https://<api-host>/*`) | Check requests (only the **claimed organization name, the sender address and domain, link domains and phone numbers**, never the email body), and uploads of **already encrypted** files. The exact host is fixed at build time from `WXT_API_BASE_URL` |
| `https://web.whatsapp.com/*` | **Sheathe**: blurs avatars, names, previews, messages, media and what you type **only while you share your screen** (or when you turn it on). It reads nothing and sends nothing. A page-world helper masks notification text while sheathed |
| Meeting sites: `meet.google.com`, `*.zoom.us`, `teams.microsoft.com`, `teams.live.com`, `teams.cloud.microsoft`, `*.webex.com`, `meet.jit.si`, `whereby.com`, `discord.com`, `app.slack.com` | **Sheathe**: a tiny page-world hook notices when the page asks Chrome to share your screen (`getDisplayMedia`) and whether it's a whole screen, a window or a tab. It doesn't read the meeting, your camera or anything on the page, and it sends nothing anywhere. With **Private view** turned on (off by default) and a single tab presented, the hook also veils your chats in the outgoing presentation video, inside your browser, before the meeting site gets it; your own screen stays readable. These sites appear in Chrome's install prompt as "read and change data" because content scripts run there |
| `https://cloudflare-dns.com/*` | A DNS-over-HTTPS lookup of `_handoff.<office domain>` (a TXT record), so the extension checks the office's key fingerprint **itself** instead of trusting our server |

## Optional: all sites (Click Guard)

| Optional permission | When it's asked | Why |
|---|---|---|
| `<all_urls>` | Only when you press **Guard every site** in the side panel. Chrome shows its own prompt | Click Guard has to be on the page *before* you click, to stop a fake "Close" or a hidden pop-up. It reads the links and buttons on pages you visit, **on this device**, and sends nothing. Turning it off unregisters it and hands the permission back to Chrome |

## Isolation

- **`web_accessible_resources`: `vault.html`, only on `https://mail.google.com/*`.** The vault is the isolated extension page where you pick a file, trim it and seal it. Gmail's page never sees the file or the key. Gmail can only display the vault frame.
- **`externally_connectable`: none.** No website and no other extension can send messages to Avaran.
- **Capture Handle (Sheathe):** WhatsApp and Gmail tabs publish a random 32-character token through Chrome's Capture Handle API. When you share a single tab, the meeting page reads it so Sheathe knows whether the shared tab is one of your chats. The token contains no data and changes on every page load.
- **Content Security Policy for extension pages:** `script-src 'self' 'wasm-unsafe-eval'`. Only the extension's own bundled code runs. WebAssembly is allowed because the bundled crypto code needs it.

## What leaves your computer

- For a check: the claimed organization name, the sender address and domain, link domains and phone numbers. Our server passes only the organization name and domains to search providers.
- Encrypted files (random-looking bytes) for a handoff.
- A DNS TXT lookup for the office's domain.
- Click Guard sends **nothing**. It never fetches a link to see where it leads; it reads the page and judges it locally (`npm run smoke:guard` asserts 0 requests). Its block log stays on this computer.
- Sheathe sends **nothing**. Detection, blurring and reveal lists all stay on this computer (`npm run smoke:sheathe` asserts 0 requests).

Every one of these calls appears in the side panel's **Privacy Ledger** with its size and a preview. Plaintext documents and email bodies are never sent. The extension contains no secret keys, because anyone can unzip an extension and read it.
