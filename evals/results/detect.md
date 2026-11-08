# Detector eval (EV2) and request detector eval (EV4)

Run 2026-11-08T17:39:45.424Z. Rules and checksums only, on the device. 60 synthetic documents: 30 with planted values in varied formats, 30 benign ones full of look-alike numbers (order and tracking numbers, masked SSNs, card last-4, dates without a birth-date label, policy numbers, ISBNs, IPs).

| Data type | Precision | Recall | TP | FP | FN |
|---|---|---|---|---|---|
| ssn | 100.0% | 100.0% | 32 | 0 | 0 |
| itin | 100.0% | 100.0% | 14 | 0 | 0 |
| ein | 100.0% | 100.0% | 13 | 0 | 0 |
| routing | 100.0% | 100.0% | 9 | 0 | 0 |
| card | 100.0% | 100.0% | 33 | 0 | 0 |
| account | 100.0% | 100.0% | 6 | 0 | 0 |
| dob | 100.0% | 100.0% | 32 | 0 | 0 |
| mrz | 100.0% | 100.0% | 10 | 0 | 0 |
| iban | n/a | n/a | 0 | 0 | 0 |
| national_id | n/a | n/a | 0 | 0 | 0 |
| tax_id | n/a | n/a | 0 | 0 | 0 |
| social_insurance | n/a | n/a | 0 | 0 | 0 |
| **all** | **100.0%** | **100.0%** | 149 | 0 | 0 |

| Email classifier (27 labeled emails, fictional senders) | Precision | Recall | TP | FP | FN | TN |
|---|---|---|---|---|---|---|
| Asks for sensitive documents | 100.0% | 100.0% | 12 | 0 | 0 | 15 |
| Asks for a password, login code or payment details | 100.0% | 100.0% | 3 | 0 | 0 | 24 |

No false positives.

No misses.

No email classifier errors.
