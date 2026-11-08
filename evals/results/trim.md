# Trim + redaction eval (EV2 on documents, EV3)

Run 2026-11-08T18:01:47.660Z in headless Chrome. Request capture confirmed nothing left the machine during trimming.

| Metric | Result |
|---|---|
| Documents (12 synthetic + 5 fixtures + 1 photo) | 18 |
| Planted sensitive values found automatically | 78/78 (100.0%) |
| Removed values found again in the output (independent pdf.js re-extract) | **0** |
| Selectable text left in flattened PDFs | 0 characters |
| Ink of planted values covered by black (avg / worst doc) | 100.0% / 100.0% |
| Every output passed its own re-scan | yes |
| Median time to trim + verify | 124 ms |

| File | Planted | Found | Leaks | Coverage | Boxes solid | Metadata | Verified | ms |
|---|---|---|---|---|---|---|---|---|
| synthetic-1.pdf | 4 | 4 | 0 | 100.0% | 4/4 | clean | ✓ | 203 |
| synthetic-2.pdf | 3 | 3 | 0 | 100.0% | 3/3 | clean | ✓ | 125 |
| synthetic-3.pdf | 6 | 6 | 0 | 100.0% | 6/6 | clean | ✓ | 128 |
| synthetic-4.pdf | 6 | 6 | 0 | 100.0% | 6/6 | clean | ✓ | 84 |
| synthetic-5.pdf | 5 | 5 | 0 | 100.0% | 5/5 | clean | ✓ | 76 |
| synthetic-6.pdf | 6 | 6 | 0 | 100.0% | 6/6 | clean | ✓ | 132 |
| synthetic-7.pdf | 8 | 8 | 0 | 100.0% | 8/8 | clean | ✓ | 141 |
| synthetic-8.pdf | 4 | 4 | 0 | 100.0% | 4/4 | clean | ✓ | 130 |
| synthetic-9.pdf | 6 | 6 | 0 | 100.0% | 6/6 | clean | ✓ | 112 |
| synthetic-10.pdf | 7 | 7 | 0 | 100.0% | 7/7 | clean | ✓ | 124 |
| synthetic-11.pdf | 5 | 5 | 0 | 100.0% | 5/5 | clean | ✓ | 126 |
| synthetic-12.pdf | 7 | 7 | 0 | 100.0% | 7/7 | clean | ✓ | 116 |
| w2-sample.pdf | 2 | 2 | 0 | n/a | 2/2 | clean | ✓ | 105 |
| bank-statement-sample.pdf | 3 | 3 | 0 | n/a | 4/4 | clean | ✓ | 186 |
| id-sample.pdf | 3 | 3 | 0 | n/a | 3/3 | clean | ✓ | 53 |
| intake-notes-sample.txt | 3 | 3 | 0 | n/a | 0/0 | clean | ✓ | 3 |
| receipt-benign.pdf | 0 | 0 | 0 | n/a | 0/0 | clean | ✓ | 32 |
| drivers-license-sample.png | 0 | 0 | 0 | n/a | 2/2 | clean | ✓ | 80 |

# Crypto performance (EV5, HANDOFF-PQ1 in Chrome)

| Size | Seal (X-Wing + AES-256-GCM) | Open | Size overhead |
|---|---|---|---|
| 1 MB | 7 ms | 11 ms | 1024.0 KB (padding to 1 MiB buckets so the real size stays hidden, plus GCM tags) |
| 10 MB | 29 ms | 27 ms | 1024.2 KB (padding to 1 MiB buckets so the real size stays hidden, plus GCM tags) |
