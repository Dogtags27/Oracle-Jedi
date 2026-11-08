# EV1 · Check engine golden set

Run 2026-11-08 07:59 UTC · 17 cases run, 2 skipped · engine timeout 8000 ms · one case at a time · 20 live checks used (budget 25)

| Metric | Measured | Target |
|---|---|---|
| Verdict accuracy | **17/17** (100%) | high |
| False "verified" | **0** | 0 |
| Crashes | 0 | 0 |
| Citation validity, independent re-fetch | **13/15** unique quotes found on the live page (86.7%); 23/27 counting every evidence item · none unreachable | 100% |
| Live latency p50 / p95 | 951 ms / 3,257 ms (n=17) | under the 8000 ms engine budget |
| Cached latency p50 / p95 | 292 ms / 437 ms (n=14, 4 under 200 ms) | < 200 ms |
| External API calls per live check | 2.0 (min 2, max 2): Exa 1.0, Tavily 1.0 | |
| External API calls per cached check | 0, plus 2.6 sequential Supabase round-trips (median 98 ms each from the eval machine) | 0 |
| Provider requests carrying the sender's address, mail provider or phone | **0** of 40 requests | 0 |

Providers per live check: exa:search ×17, tavily:extract ×14, tavily:search ×3.

**Confusion matrix** (rows: expected, columns: engine verdict)

| expected \ actual | verified | mismatch | unknown | crash |
|---|---|---|---|---|
| verified | 8 | 0 | 0 | 0 |
| mismatch | 0 | 6 | 0 | 0 |
| unknown | 0 | 0 | 3 | 0 |

**Per case**

| # | Claimed organization | Sender | Expected | Engine | | Official domain found | Live | Cached | Live providers | Quotes valid |
|---|---|---|---|---|---|---|---|---|---|---|
| V01 | H&R Block | hrblock.com | verified | verified | ✓ | hrblock.com | 3257 ms | 437 ms (cache) | exa:search, tavily:extract | 2/2 |
| V02 | Jackson Hewitt | jacksonhewitt.com | verified | verified | ✓ | jacksonhewitt.com | 1219 ms | 309 ms (cache) | exa:search, tavily:extract | 2/2 |
| V03 | ADP | adp.com | verified | verified | ✓ | adp.com | 664 ms | 335 ms (cache) | exa:search, tavily:extract | 0/2 |
| V04 | Paychex | paychex.com | verified | verified | ✓ | paychex.com | 951 ms | 345 ms (cache) | exa:search, tavily:extract | 2/2 |
| V05 | Charles Schwab | schwab.com | verified | verified | ✓ | schwab.com | 625 ms | 306 ms (cache) | exa:search, tavily:extract | 2/2 |
| V06 | Fidelity Investments | fidelity.com | verified | verified | ✓ | fidelity.com | 1032 ms | 339 ms (cache) | exa:search, tavily:extract | 1/1 |
| V07 | Wells Fargo | notify.wellsfargo.com | verified | verified | ✓ | wellsfargo.com | 1419 ms | 292 ms (cache) | exa:search, tavily:extract | 2/2 |
| V08 | Arizona State University | asu.edu | verified | verified | ✓ | asu.edu | 1253 ms | 290 ms (cache) | exa:search, tavily:extract | 2/2 |
| M01 | H&R Block | oj-eval-m01@gmail.com | mismatch | mismatch | ✓ | hrblock.com | 3229 ms | 210 ms (cache) | exa:search, tavily:extract | 2/2 |
| M02 | Jackson Hewitt | oj-eval-m02@outlook.com | mismatch | mismatch | ✓ | jacksonhewitt.com | 998 ms | 199 ms (cache) | exa:search, tavily:extract | 2/2 |
| M03 | ADP | oj-eval-m03@yahoo.com | mismatch | mismatch | ✓ | adp.com | 523 ms | 196 ms (cache) | exa:search, tavily:extract | 0/2 |
| M04 | Charles Schwab | oj-eval-m04@gmail.com | mismatch | mismatch | ✓ | schwab.com | 595 ms | 197 ms (cache) | exa:search, tavily:extract | 2/2 |
| M05 | Wells Fargo | oj-eval-m05@outlook.com | mismatch | mismatch | ✓ | wellsfargo.com | 1757 ms | 193 ms (cache) | exa:search, tavily:extract | 2/2 |
| M06 | Arizona State University | oj-eval-m06@gmail.com | mismatch | mismatch | ✓ | asu.edu | 796 ms | 350 ms (cache) | exa:search, tavily:extract | 2/2 |
| U01 | Quillstead & Varnholt Tax Bureau | oj-eval-u01@gmail.com | unknown | unknown | ✓ | none | 348 ms | 461 ms (live) | exa:search, tavily:search | - |
| U02 | Brindlecove Payroll Collective | payroll@brindlecove-payroll.example | unknown | unknown | ✓ | none | 454 ms | 451 ms (live) | exa:search, tavily:search | - |
| U03 | Orrinvale Thistlebrook Academy | oj-eval-u03@yahoo.com | unknown | unknown | ✓ | none | 347 ms | 371 ms (live) | exa:search, tavily:search | - |
| D01 | Maple Street Tax | - | verified | skipped | | DEMO_OFFICE_DOMAIN is not set | | | | |
| D02 | Maple Street Tax | maplestreet.tax.help@gmail.com | mismatch | skipped | | DEMO_OFFICE_DOMAIN is not set | | | | |

**Citations that did not check out** (unique)

- invalid · V03, M03 · https://adp.com/ · "Talk to sales 800-225-5237 Get Pricing" · quote not found in the re-fetched static HTML (7521 chars of text)
- invalid · V03, M03 · https://adp.com/ · "Getting started with ADP is easy. Sign up today and get up to 6 months FREE." · quote not found in the re-fetched static HTML (7521 chars of text)

**Method**

- Inputs are claim/sender pairs only; nothing is sent to anyone. Free-email sender addresses are synthetic placeholders. Fictional organizations and the demo office are made up; no look-alike domains of real brands are used.
- Pass 1 deletes the case's `check_cache` row before every check, so each check is live. Pass 2 repeats the same cases with the cache warm. Organizations with no official site are never cached, so they run live again in pass 2 and are left out of cached latency (U01, U02, U03).
- Latency is wall-clock around `runCheck`. p95 uses the nearest-rank method (with n=17: rank 17 of 17 sorted fastest to slowest, i.e. the slowest check). Live latency includes any caching Exa and Tavily do on their side, so repeating the same queries within minutes is faster than a first-ever check.
- API calls are counted by intercepting `fetch` during each check (Exa = api.exa.ai, Tavily = api.tavily.com). The same interceptor checks that no provider request body contains the sender's email, its local part, the sender's (non-official) domain or any phone number from the message.
- Citation validity: every web evidence item from the live pass is re-fetched with plain `fetch` (honest bot user-agent), tags/scripts/styles stripped, basic HTML entities decoded, whitespace collapsed, lowercased, and the markdown punctuation the engine itself strips (#, *, _, >, backtick, pipe) removed on both sides. 2 unique quote(s) matched only after ignoring spacing between adjacent tags. HTTP errors, timeouts, bot-challenge pages and JavaScript-only pages count as unreachable, not invalid. The engine's own `verified` flag was true for 27/27 items; it compares each quote with the same extracted text it was cut from, so only this independent re-fetch can catch a quote that is not on the page.
- D01 skipped: DEMO_OFFICE_DOMAIN is not set.
- D02 skipped: DEMO_OFFICE_DOMAIN is not set.
