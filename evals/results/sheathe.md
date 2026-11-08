# Sheathe eval (screen-share privacy)

Run 2026-11-08T11:52:47.244Z in Chrome with the real extension. Fixtures are structure-only pages with fictional people.

| Metric | Result |
|---|---|
| Time from the share picker opening to another tab being sheathed | **16 ms** (before any source is picked) |
| Sensitive elements blurred during an entire-screen share (WhatsApp + Gmail) | **22/22** |
| Reveal precision | only the revealed chat is visible; other chats stay blurred |
| Unrecognized page structure | whole region blurred (fails closed) |
| "Sheathe this page" on any site | 6/6 sensitive values caught, 0 false hits |
| Network requests made by Sheathe | **0** |
| Real share picker in this run | shared monitor |
