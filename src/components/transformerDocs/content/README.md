# Transformer docs content (human-editable)

| Path | Purpose |
|------|---------|
| `glossary.yaml` | Tooltip text for `{{termKey\|display}}` links in markdown |
| `chrome.en.yaml` / `chrome.de.yaml` | Modal chrome and chapter titles |
| `en/*.md` / `de/*.md` | Overview, Examples, Troubleshooting |

**Glossary links in markdown:** `{{custom_transformer}}`, `{{custom_transformer|plain}}`, or `{{custom_transformer|:custom}}` (leading `:` = render display in `<code>`).

**After adding a new glossary key:** run `npm run generate:glossary-keys` so TypeScript picks up the key.

API reference tables stay in `transformerApiReference.ts` (structured data, not markdown).
