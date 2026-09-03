# AuditOS — SIRE ↔ SMS Gap Analysis

Standalone maritime auditor tool for comparing a company SMS PDF against a user-supplied SIRE Excel workbook with page-level source traceability.

## What it does

1. Upload a text-based/OCR-enabled Company SMS PDF.
2. Upload a SIRE Excel workbook (`.xlsx`, `.xls`, `.xlsm`).
3. AuditOS auto-detects usable workbook sheets and likely columns for question reference, section/topic, requirement text, guidance, rank, applicability and risk/category.
4. Each SIRE row is mapped against indexed SMS pages.
5. Results are classified as:
   - Strong Coverage
   - Partial Coverage
   - Possible Gap
   - No Relevant Control Located
   - Needs Auditor Review
6. Every mapping preserves the original SMS PDF page number and shows matched excerpts.
7. `Challenge Gap` performs a broader synonym/alternate-terminology search.
8. The auditor can mark Confirmed Gap, Dismissed, Needs Verification or Unreviewed.
9. Results can be exported to CSV.

## Guardrail

**Document coverage only — not a compliance conclusion.**

Missing material is never automatically treated as non-compliance. Auditor judgement remains final.

## Privacy

The deterministic workflow parses the uploaded PDF and Excel workbook in the browser. Source files are not stored in Supabase or Vercel storage. Derived working analysis can be retained locally in IndexedDB on the auditor's device.

## Development

```bash
npm test
npm run verify
npm run build
```

The Vercel-ready output is generated in `.vercel-static/`.

## Vercel

The repository includes `vercel.json` with:

- no framework dependency
- no install step
- `node auditos/build.mjs` build command
- `.vercel-static` output directory
- security headers

Import this repository into Vercel and deploy `main`.

## Source layout

```text
auditos/
  index.html
  styles.css
  app.js
  browser/
    parsers.js
  core/
    excel-schema.js
    mapper.js
    export.js
  tests/
  build.mjs
.github/workflows/verify.yml
package.json
vercel.json
```

## Verification

GitHub Actions runs the full test suite, JavaScript syntax verification, static Vercel build, isolated-output checks, and confirms the production bundle has no Supabase or login dependency.
