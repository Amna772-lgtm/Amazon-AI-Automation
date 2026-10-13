# Sample import files

`products-sample.csv` / `products-sample.xlsx` contain the same 11 URL rows (plus one blank row) and exercise every import outcome:

| Outcome | Rows | Why |
|---|---|---|
| VALID | 2, 4, 5, 6, 10, 13 | US (×2), DE, GB, IN (mobile URL), AE |
| DUPLICATE | 3, 12 | Same marketplace + ASIN as rows 2 and 4 (tracking params / missing scheme ignored) |
| INVALID | 7, 8, 9 | No ASIN (search page), unresolvable short link, not an Amazon domain |

Expected summary after import: **6 valid, 2 duplicate, 3 invalid**.

Regenerate the `.xlsx` with `node samples/make-xlsx.js`.
