# Custom transformer IntelliSense — agent context (work log)

LLM-oriented notes: **findings**, **shortcuts**, **progress**, **todos**. Pair with [feature-coding-custom-transformers.md](feature-coding-custom-transformers.md).

---

## Findings

1. **Monaco `javascriptDefaults` vs `typescriptDefaults`**  
   Editors use `language="javascript"`. Extra libs registered only on `typescriptDefaults` are **not** part of the JavaScript language service project. Registration must call **`javascriptDefaults.addExtraLib`** as well (same URI + content). Implemented in [`src/utils/monacoExtraLib.ts`](../src/utils/monacoExtraLib.ts).

2. **Why scripts felt “fine” but `transform(input, …)` did not**  
   Script buffers are plain `ctx.*` against `declare const ctx` in [`scriptCtxDecl.ts`](../src/scripts/scriptCtxDecl.ts). Custom transformer code is **`function transform(input, …)`**; the parameter **shadows** `declare const input`, so typings need **`@param {TransformInput} input`** (etc.) on `transform`. The default skeleton in [`defaultCustomTransformerCode`](../src/transformers/customCodeTransformer.ts) already includes that JSDoc.

3. **`api.log` “missing”**  
   Same root cause: untyped `api` parameter + invisible extra lib ⇒ weak `api.*` completions. Not a gap in [`transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts) for `log`; it was resolution/context.

4. **Testing without headless Monaco**  
   Use **`ts.createLanguageService`** with a virtual file for `TRANSFORMER_CODE_EXTRA_LIB_URI` + a `.js` user file (`allowJs`, `checkJs`), then **`getCompletionsAtPosition`**. See [`src/transformers/transformerIntellisense.integration.test.ts`](../src/transformers/transformerIntellisense.integration.test.ts).

5. **Implicit `any` parameters**  
   If authors delete the JSDoc block, `input.` completions **lose** typed members (regression test documents this).

---

## Shortcuts

| Need | Location |
|------|-----------|
| Dual extra-lib registration | [`src/utils/monacoExtraLib.ts`](../src/utils/monacoExtraLib.ts) |
| Declarations / `TRANSFORMER_CODE_EXTRA_LIB_URI` | [`src/transformers/transformerCodeDecl.ts`](../src/transformers/transformerCodeDecl.ts) |
| Default skeleton + JSDoc | [`defaultCustomTransformerCode`](../src/transformers/customCodeTransformer.ts) |
| Monaco editor host | [`src/components/TransformerCustomCodeEditor.tsx`](../src/components/TransformerCustomCodeEditor.tsx) |
| Completion golden tests | [`src/transformers/transformerIntellisense.integration.test.ts`](../src/transformers/transformerIntellisense.integration.test.ts) |
| Mock unit test for registration | [`src/utils/monacoExtraLib.test.ts`](../src/utils/monacoExtraLib.test.ts) |

**Run focused tests**

```bash
npm run test:run -- src/utils/monacoExtraLib.test.ts src/transformers/transformerIntellisense.integration.test.ts
```

---

## Progress (implemented)

- [x] Register transformer (and script) extra libs on **both** `typescriptDefaults` and `javascriptDefaults`; composite `dispose()`.
- [x] Integration tests: `input.` / `api.` on default skeleton; legacy global `input.` body; no-JSDoc negative case.
- [x] Unit test: mock Monaco verifies dual `addExtraLib` + both disposes.
- [x] Full `npm run test:run` — green.
- [x] **`javascriptDefaults.setCompilerOptions({ checkJs: true })`** — **not** added; completions sufficient without global compiler-option side effects.

---

## Todos / follow-ups (not done here)

- [ ] Optional: scoped `checkJs` / diagnostics tuning **only if** real-app completion gaps remain after manual QA in Builder.
- [ ] E2E: avoid asserting Monaco completion menus (flaky); smoke “Code tab mounts” only if needed.
- [ ] Doc drift: [feature-coding-custom-transformers.md](feature-coding-custom-transformers.md) still says `declare const` was removed; file still includes them for legacy-body globals — align when editing that doc.
- [ ] Enrich `.d.ts` / snippets further (e.g. `TransformOutput` field tooltips) as API grows.

---

## Changelog

- **2026-05-06** — Dual `addExtraLib`; TS language service integration tests; this work log.
