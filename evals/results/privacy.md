# Privacy assertions (TS6) and egress budget (EV6)

Run 2026-11-08T11:53:29.043Z: an office registers and creates a request link, then a client seals an **untrimmed** bank statement (SSN, account and routing numbers) and the office opens it, then someone runs a Check. Every request was captured below the app with a fetch hook, independent of our own Privacy Ledger.

| Assertion | Result | Detail |
|---|---|---|
| No SSN, account or routing number, name, address or filename in any request (URL or body) | ✓ pass | 38 requests scanned |
| Detectors find no sensitive patterns in any JSON body or URL | ✓ pass |  |
| Every upload is indistinguishable from random bytes (entropy ≥ 7.9 bits/byte) | ✓ pass | 1 upload(s): 7.9971 bits/byte, 65552 bytes |
| Check sends the claim, never the message text | ✓ pass | fields sent: claimedOrg,linkDomains,phones,senderDomain,senderEmail |
| Zero third-party requests (no scripts, fonts, analytics or trackers) on /office, /r and /check | ✓ pass |  |
| Every script is first-party | ✓ pass |  |
| API security headers present (no-referrer, no-store, nosniff, HSTS, frame options) | ✓ pass |  |
| API refuses CORS for unknown web origins | ✓ pass | no CORS header |
| Deployed pages ship a strict CSP (first-party scripts only, no framing, no plugins) + no-referrer | ✓ pass | from frontend/vercel.json |

| Flow | Destination | Kind | Requests | Bytes sent |
|---|---|---|---|---|
| Office: register, request, open | localhost:8787 | JSON | 26 | 22,216 |
| Client: seal & send | localhost:8787 | JSON | 9 | 2,236 |
| Client: seal & send | oqxtenvgnlhiethzjgtf.supabase.co | ciphertext | 1 | 65,552 |
| Office: register, request, open | oqxtenvgnlhiethzjgtf.supabase.co | JSON | 1 | 0 |
| Check who's asking | localhost:8787 | JSON | 1 | 177 |
