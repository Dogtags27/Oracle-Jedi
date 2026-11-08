# Demo setup: the Maple Street Tax office

**Maple Street Tax is fictional.** Its site says so in a banner and footer, and every phone number is in the reserved fictional range `555-01xx`. Never copy a real firm's name, logo or text, and never send the training sample to anyone but your own test inbox.

Commands are for **Windows PowerShell**, run from the repo root (`Oracle-Jedi\`).

**What you will end up with**

| Thing | Value |
|---|---|
| Office domain (`OFFICE_DOMAIN`) | the domain you buy, for example `maplestreettax.xyz` |
| Office email on the domain | `frontdesk@OFFICE_DOMAIN` |
| Office Gmail ("tiny office" case) | Gmail account 3 below |
| Official phone | `(617) 555-0118` |
| Secure upload link | `https://OFFICE_DOMAIN/secure-upload`, which redirects to a 30-day HANDOFF request link on `APP_URL` |
| Office public key | `https://OFFICE_DOMAIN/.well-known/handoff.json` |
| DNS proof | TXT `_handoff.OFFICE_DOMAIN` = `v=HO1; fp=<fingerprint>` |

**What the training sample uses, and the site must never contain:** sender `maplestreet.tax.help@gmail.com`, link domain `maple-street-taxdocs.co`, phone `(617) 555-0142`. The build script refuses to build if any of them appears.

**Expected verdicts** (simulated against the built pages with the real engine rules):
- Sample from `maplestreet.tax.help@gmail.com` → **Doesn't match**. Quotes show the real addresses and phone; "look-alike `maple-street-taxdocs.co`".
- `Maple Street Tax <frontdesk@OFFICE_DOMAIN>` → **Verified**, with quotes from the site.
- `Maple Street Tax <office Gmail>` → **Verified** (the Gmail is listed on the site).

Order: part 1 now → `docs/DEPLOY.md` (backend + frontend live) → parts 2 to 9.

---

## 1. Buy the domain on Cloudflare Registrar (about 5 minutes)

Buying on Cloudflare means DNS is on Cloudflare from the start, with no nameserver change.

1. Sign in at https://dash.cloudflare.com (create a free account if needed).
2. Left menu → **Domain Registration** → **Register Domains**.
3. Search `maplestreettax`. Pick a cheap TLD. Cloudflare sells at cost, and `.xyz`, `.site`, `.online` or `.click` are usually only a few dollars to about 12 USD for the first year. Check the price shown.
   - Keep the label exactly **`maplestreettax`**. Then the engine flags the sample's `maple-street-taxdocs.co` as a **look-alike**.
   - Avoid `.help`: `maplestreettax.help` reads like the scam address, and the build script rejects it.
   - Skip anything marked premium, and skip a TLD where a real business already uses that exact name.
4. Complete checkout (card + registrant contact; WHOIS privacy is on by default). Within minutes the domain appears under **Websites** as an active zone.
5. Write it down as `OFFICE_DOMAIN` and give it to whoever is creating the AWS service (`DEMO_OFFICE_DOMAIN`).

## 2. Zone settings that the Check engine depends on

The Check engine reads your pages through Tavily Extract. Two Cloudflare defaults can break that.

1. **Turn off Email Address Obfuscation (required).** Cloudflare turns it on by default, and it rewrites every email address on the page into `[email protected]`, so the engine can't see `frontdesk@…` and **Verified can't happen**.
   - Dashboard → your domain → **Security** → **Settings** → filter **Client-side abuse** → **Email Address Obfuscation** → **Off**.
   - On the older dashboard: **Scrape Shield** → **Email Address Obfuscation** → Off.
2. **Let the extractor in.** Same page → filter **Bot traffic**:
   - **AI Crawler and Agent access policies** → set Search, Agents and Training to **Allow (do not block)** → Save.
   - **Bot Fight Mode** → Off.
   - Don't enable a managed `robots.txt` that blocks AI crawlers.
3. Leave **Web Analytics** off for the Pages project. The site has no scripts and its CSP blocks injected ones.

## 3. Gmail test accounts

Create them in a separate Chrome profile so your personal inbox never shows on screen. Google may ask for phone verification, and one phone number can only verify a few accounts.

| # | Role | Suggested address | Display name |
|---|---|---|---|
| 1 | **Client inbox**: the extension runs here, and every demo email arrives here | anything, for example `ojdemo.client.<initials>@gmail.com` | `Demo Client` |
| 2 | **Training sender**: sends the `[TRAINING SAMPLE]` | try `maplestreet.tax.help`. If it's taken, any new address works; the verdict is the same because it isn't on the site | `Maple Street Tax` |
| 3 | **Office Gmail**: the "tiny office with a Gmail address" case, listed on the site | for example `maplestreettax.frontdesk.<initials>@gmail.com` | `Maple Street Tax` |

- Set the display name at sign-up (First name `Maple Street`, Last name `Tax`). Or later: Gmail → gear → **See all settings** → **Accounts and Import** → **Send mail as** → **edit info**.
- If Google won't let you make account 3, use account 1's address as the office Gmail in part 5. **Never use account 2's.**

## 4. Register the office in the production dashboard

Do this on the **deployed** dashboard (`APP_URL/office`), in the browser profile you'll demo from. The office's private keys are encrypted with your passphrase and stored in that browser only.

1. Open `APP_URL/office`.
2. **Office name:** exactly `Maple Street Tax` (pre-filled). The Check engine finds the office by this exact name when the sender uses Gmail.
3. **Official website domain:** `OFFICE_DOMAIN`, with no `https://` and no `www`.
4. Choose a **passphrase** (8+ characters) and write it down in your password manager. → **Generate keys & register**.
5. Immediately click **Download recovery kit**. Store it **outside the repo** (password manager or USB), never in git or chat. The kit is useless without the passphrase, and the passphrase is useless without the kit. You need both.
6. Click **Download handoff.json**. It contains only the public key bundle and its signature, no secrets. Move it over the placeholder:
   ```powershell
   Move-Item -Force "$env:USERPROFILE\Downloads\handoff.json" demo-office\site\.well-known\handoff.json
   ```
   If Chrome saved it as `handoff (1).json`, use that name instead. The file is public, so committing it is fine.
7. Copy the DNS record shown under **Verify your domain** (name `_handoff.OFFICE_DOMAIN`, value `v=HO1; fp=…`). You need it in part 6.
8. In **Request documents**: keep W-2 and Photo ID, choose **Link valid 30 days**, and click **Create request link**. Copy the link (`APP_URL/r/rq_…`). That is `UPLOAD_URL`.

**Office key lock: read this.**
- Once a domain is registered, the server refuses a different key for it unless `_handoff.OFFICE_DOMAIN` **already** publishes the new key's fingerprint.
- Once the domain is **DNS-verified** (part 6), a different key is refused outright (`office_locked`), even with DNS. The only way out is deleting the row in Supabase → Table Editor → `offices`, which also deletes its requests and handoffs.
- To use the office in another browser or on another laptop: `APP_URL/office` → **Import recovery kit** → unlock with the passphrase. Never click **Use a different office** unless you have the kit.

## 5. Build the site and host it on Cloudflare Pages

### 5.1 Build

`demo-office/site/` holds the pages with three placeholders. The build script fills them in, writes `demo-office/dist/` (git-ignored), and refuses to build if a training-sample identifier would end up on the site.

```powershell
powershell -ExecutionPolicy Bypass -File demo-office\build.ps1 `
  -Domain maplestreettax.xyz `
  -OfficeGmail maplestreettax.frontdesk.xx@gmail.com `
  -UploadUrl https://oracle-jedi.vercel.app/r/rq_XXXXXXXX
```

Git Bash or macOS: `bash demo-office/build.sh maplestreettax.xyz maplestreettax.frontdesk.xx@gmail.com https://oracle-jedi.vercel.app/r/rq_XXXXXXXX`

- If you're deploying before part 4 (to get the custom domain and certificate going early), use `APP_URL` as `-UploadUrl` and ignore the placeholder warning. Rebuild and redeploy after part 4.
- What's inside: `index.html` (home), `contact.html` (served at `/contact`), `404.html`, `styles.css`, `_redirects` (`/secure-upload` → `UploadUrl`, 302), `_headers` (strict CSP, `no-referrer`, CORS on `handoff.json`), `.well-known/handoff.json`. No scripts, fonts or trackers.
- The Check engine fetches `https://OFFICE_DOMAIN/`, `/contact` and `/contact-us`. `/contact-us` returns the 404 page on purpose.

### 5.2 First deploy (direct upload)

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** tab (or the "Looking to deploy Pages?" link) → **Upload assets** / **Use direct upload**.
2. Project name `maple-street-tax` → **Create project**.
3. Drag the **`demo-office\dist`** folder (the folder itself, from Explorer) onto the upload area → **Deploy site**. You get `https://maple-street-tax.pages.dev`.
4. Project → **Custom domains** → **Set up a custom domain** → enter `OFFICE_DOMAIN` (the apex, no `www`) → **Continue** → **Activate domain**. Cloudflare adds the DNS record itself. Wait until it shows **Active** (usually 2 to 15 minutes for the certificate).

### 5.3 Redeploy after any change

Rebuild (5.1), then project → **Deployments** → **Create deployment** (or **Upload assets**) → Production → drag `demo-office\dist` again → **Save and deploy**.

Fallback if the dashboard upload ever skips `.well-known` (check in 5.4): `npx wrangler pages deploy demo-office\dist --project-name maple-street-tax` (it opens a browser to log in).

### 5.4 Check the live site

```powershell
$D = "maplestreettax.xyz"
curl.exe -s "https://$D/contact" | Select-String "frontdesk@|555-0118|secure-upload|email-protection"
curl.exe -s "https://$D/.well-known/handoff.json"
curl.exe -s -o NUL -w "%{http_code} %{redirect_url}`n" "https://$D/secure-upload"
curl.exe -s -o NUL -w "%{http_code}`n" "https://$D/contact-us"
```

Expected:
- The contact page shows lines with `frontdesk@…`, the Gmail and `555-0118`, and **no** `email-protection`. If you see `email-protection`, redo part 2 step 1, then redeploy.
- `handoff.json` returns the real bundle (`"v": 1`, `"domain"`, `"kemPk"`, `"sigPk"`, `"sig"`), not the placeholder.
- `/secure-upload` returns `302` to your request link.
- `/contact-us` returns `404`.

## 6. Publish the DNS TXT record and verify

1. Cloudflare → your domain → **DNS** → **Records** → **Add record**:
   - **Type:** `TXT`
   - **Name:** `_handoff`. Cloudflare appends the domain, so it becomes `_handoff.OFFICE_DOMAIN`.
   - **Content:** the exact value from the dashboard: `v=HO1; fp=` followed by the 64-character hex fingerprint. If Cloudflare suggests wrapping it in quotes, either way works.
   - **TTL:** Auto → **Save**.
2. Confirm it is public. Any of these works:
   ```powershell
   Resolve-DnsName -Name "_handoff.$D" -Type TXT -Server 1.1.1.1
   nslookup -type=TXT "_handoff.$D" 1.1.1.1
   curl.exe -s -H "accept: application/dns-json" "https://cloudflare-dns.com/dns-query?name=_handoff.$D&type=TXT"
   ```
   - macOS/Linux: `dig +short TXT _handoff.maplestreettax.xyz @1.1.1.1`
   - In a browser: `https://dns.google/resolve?name=_handoff.maplestreettax.xyz&type=TXT`

   The answer must contain `v=HO1; fp=<the same fingerprint as the dashboard>`. The `cloudflare-dns.com` line queries the same resolver the backend uses.
3. Back in `APP_URL/office` → **Check DNS**. The badge turns **Verified** and the DNS box disappears. If it says "No TXT record found yet", wait a minute and press it again.
   - Don't query `_handoff.…` **before** the record exists. Resolvers cache "not found" for a while. If that happened, purge it at https://one.one.one.one/purge-cache/ (TXT, `_handoff.OFFICE_DOMAIN`).
4. `DEMO_OFFICE_DOMAIN` on AWS must be `OFFICE_DOMAIN`. Set it when you create the service. If you missed it, add it via `docs/DEPLOY.md` step 2.6 together with any other update. It's informational today: no route reads it yet.

## 7. Prime and test the Check (before any rehearsal)

The Check engine caches what it fetched from your site for **24 hours** (`check_cache`, key `registry:OFFICE_DOMAIN`). Run the first check only after the final site is live (part 5.4 passes).

1. `APP_URL/check` → **Load training sample** → **Check**. Expect **Doesn't match**, quotes from `https://OFFICE_DOMAIN/…` that are marked verified, the official phone `(617) 555-0118`, and the upload link `https://OFFICE_DOMAIN/secure-upload`.
2. Set **From** to `Maple Street Tax <frontdesk@OFFICE_DOMAIN>` and **Message** to the legit text in part 8.2 → **Check** → **Verified**.
3. Set **From** to `Maple Street Tax <office Gmail>` → **Verified**.

If the quotes are missing or stale, delete the cached copy in Supabase → **SQL Editor**: `delete from public.check_cache where org_key = 'registry:maplestreettax.xyz';`. Then check again. Also re-check part 2: email obfuscation and bot blocking.

## 8. Send the demo emails (only to your own test inbox)

### 8.1 Training sample (from account 2 → account 1)

- **Subject:** `[TRAINING SAMPLE] Documents needed for your 2025 return`
- **Body:** paste exactly as below. It's the same text as `SAMPLE_BODY` in `frontend/src/pages/Check.tsx`:

```
[TRAINING SAMPLE]
Hi,
This is Maple Street Tax. To finish your 2025 return we need your W-2 and a photo of your driver's license today.
Please upload here: https://maple-street-taxdocs.co/upload
Questions? Call (617) 555-0142

Maple Street Tax
```

- Send it only to account 1. If it lands in Spam, open it and click **Not spam**.
- Never click the `maple-street-taxdocs.co` link outside the demo. In the demo, the link guard's stop screen is the point.

### 8.2 Legit request (from account 3, the office Gmail → account 1)

- **Subject:** `Your 2025 tax documents`
- **Body:**

```
Hi,
This is Maple Street Tax. Please send your W-2 and a photo ID for your 2025 return through our secure upload page:
https://maplestreettax.xyz/secure-upload

Maple Street Tax
```

Use your real `OFFICE_DOMAIN` in the link. The link is on the office's own domain, so the card raises no "link points elsewhere" warning, and it redirects to the HANDOFF request page.

### 8.3 Optional: make frontdesk@ receive mail

Cloudflare → your domain → **Email** → **Email Routing** → **Get started** → add custom address `frontdesk` → destination = the office Gmail (account 3) → confirm the verification email → let Cloudflare add the MX/SPF records. This is receive-only. Sending *as* `frontdesk@…` needs an SMTP provider, so the Check page (part 7.2) is how you show the domain-sender Verified case.

## 9. Pre-rehearsal checklist

- [ ] `https://OFFICE_DOMAIN/contact` shows real email addresses (no `[email protected]`).
- [ ] `https://OFFICE_DOMAIN/.well-known/handoff.json` is the real bundle.
- [ ] The dashboard badge reads **Verified**, and the safety words match the ones shown on the request page.
- [ ] The Check page gives all three expected verdicts (part 7).
- [ ] Gmail account 1 with the production extension: the training sample → **Doesn't match** card. The legit email → **Verified** card.
- [ ] Recovery kit + passphrase stored outside the repo. Two people know where.
