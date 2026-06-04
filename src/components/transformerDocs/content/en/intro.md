---
keywords:
  - intro
  - transformer
  - custom
  - code
  - basics
  - monaco
  - intellisense
searchText: >-
  Custom transformers JavaScript transform function TransformInput TransformOutput Monaco IntelliSense JSDoc
  physics each frame
---

A {{custom_transformer|:custom}} transformer is {{JavaScript|:JavaScript}} that runs every physics step. It reads {{TransformInput|:TransformInput}}, can change {{actions|:input.actions}}, and returns {{TransformOutput|:TransformOutput}} (forces, impulses, or `{}`).

### Function shape

Define {{transform|:transform(input, dt, params, state, api)}}. Parameters {{dt|:dt}}, {{params|:params}}, and {{state|:state}} are described in the **API reference** chapter. Code identifiers stay English so you can copy from the docs.

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

{{JSDoc|JSDoc}} or inline `@type` comments improve {{Monaco|Monaco}} {{IntelliSense|IntelliSense}} for {{input_object|:input}} and {{api|:api}}.

<p class="doc-muted">Stack order: lower priority runs first. Typical car: input → your custom code → car2.</p>
