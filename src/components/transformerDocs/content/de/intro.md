---
keywords:
  - intro
  - transformer
  - custom
  - code
  - basics
  - monaco
  - intellisense
  - überblick
searchText: >-
  Custom Transformer JavaScript transform Funktion TransformInput TransformOutput Monaco IntelliSense JSDoc
  Physik jeden Schritt
---

Ein {{custom_transformer|:custom}}-Transformer ist {{JavaScript|:JavaScript}}-Code, der in jedem Simulationsschritt läuft. Er liest {{TransformInput|:TransformInput}}, darf {{actions|:input.actions}} ändern und gibt {{TransformOutput|:TransformOutput}} zurück — Kräfte, Impulse oder ein leeres `{}`.

### Signatur

So sieht die Funktion aus: {{transform|:transform(input, dt, params, state, api)}}. Was {{dt|:dt}}, {{params|:params}} und {{state|:state}} bedeuten, steht im Kapitel **API-Referenz**. Die Namen im Code bleiben Englisch — so kannst du sie direkt übernehmen.

```javascript
/**
 * @param {TransformInput} input
 * @param {number} dt
 * @param {Record<string, any>} params
 * @param {Record<string, any>} state
 * @param {TransformerRuntimeApi} api
 * @returns {TransformOutput}
 */
function transform(input, dt, params, state, api) {
  // Your code here
  return {
    impulse: [0, 10, 0],
  };
}
```

{{JSDoc|JSDoc}} oder `@type`-Kommentare im Code helfen {{Monaco|Monaco}} dabei, dir bei {{input_object|:input}} und {{api|:api}} Vorschläge zu machen ({{IntelliSense|IntelliSense}}).

<p class="doc-muted">Reihenfolge: Je kleiner priority, desto früher läuft der Schritt. Typisch fürs Auto: input → dein Code → car2.</p>
