# Transformer Pattern — LLM-Friendly Guide

**Intent**
- Describe a modular design pattern that transforms input data through a sequence of small, focused components (transformers) to produce structured output.

**Problem**
- Large monolithic processors are hard to test, reuse, and adapt to changing inputs. Systems that must normalize, validate, enrich, and format data need a predictable, debuggable pipeline.

**Solution (Pattern Summary)**
- Model processing as a linear or directed graph of independent transformer units. Each transformer:
  - Accepts a defined input shape.
  - Performs one responsibility (validate, normalize, enrich, map, serialize).
  - Emits a clearly specified output shape for the next transformer.
- Compose transformers into a pipeline that runs them in sequence (or conditional branches). Make transformers pure functions where possible and isolate side-effects.

**When to Use**
- Data ingestion and ETL flows.
- Request/response normalization in APIs.
- Complex mapping or enrichment steps that benefit from reuse and testing.
- LLM prompting workflows where text or structured inputs are incrementally constructed or sanitized.

**Core Components**
- Transformer (unit): Function or class with `transform(input) => output`.
- Pipeline/Orchestrator: Composes transformers and manages flow, errors, and branching.
- Schemas/Contracts: Define input/output shapes (JSON Schema / TypeScript types) for verification.
- Error handling strategy: Fail-fast, accumulate errors, or skip-invalid with logging.

**Typical Sequence**
1. Ingest raw input
2. Validate and reject clearly invalid inputs
3. Normalize shapes/units (e.g., units, casing)
4. Enrich (lookup ids, fetch metadata)
5. Map to internal domain model
6. Serialize for downstream consumers

**Design Tips**
- Keep transformers single-responsibility and small.
- Prefer pure functions for deterministic behavior and easy testing.
- Use explicit contracts (types / JSON Schema) between transformers.
- Allow easy insertion/removal of transformers in the pipeline.
- Provide contextual metadata (trace id, source) through the pipeline.

**Example (pseudo-JS)**

```js
// Transformer signature
// async function transformer(ctx) => ctx

async function validateSchema(ctx) {
  if (!isValid(ctx.input)) throw new Error('invalid')
  return ctx
}

async function normalizeNames(ctx) {
  ctx.input.name = ctx.input.name.trim()
  return ctx
}

async function enrichWithProduct(ctx) {
  ctx.input.product = await fetchProduct(ctx.input.sku)
  return ctx
}

// Pipeline runner
async function runPipeline(ctx, transformers) {
  for (const t of transformers) {
    ctx = await t(ctx)
  }
  return ctx
}
```

**LLM-Friendly Formatting & Prompts**
- When describing transformer pipelines to an LLM, present data shapes explicitly (JSON Schema) and show a small example input and expected output.
- Provide a step-by-step plan the LLM can follow, e.g.:
  1. Validate input JSON against schema A
  2. Normalize fields (list fields, casing)
  3. Enrich: call external API B to add `product_name`
  4. Output final JSON matching schema C

- Use short, deterministic instructions and include allowed values and edge-cases.

Prompt template (for LLMs):

```
You are a "transformer" that runs only one step. Input: <JSON>. Task: <single responsibility description>. Output: <JSON schema>. Example:
Input: {"sku":"A123","name":"  ACME "}
Output: {"sku":"A123","name":"ACME"}
```

**JSON Schema Example (normalize name)**

```json
{
  "$id": "https://example.com/schemas/normalize-name.json",
  "type": "object",
  "properties": {
    "sku": {"type":"string"},
    "name": {"type":"string"}
  },
  "required": ["sku","name"]
}
```

**Testing Strategy**
- Unit-test each transformer with valid, invalid, and boundary inputs.
- Property-based tests for normalization logic (e.g., whitespace, unicode).
- Integration tests for the full pipeline with mocked external calls.

**Anti-Patterns**
- Transformers that perform multiple unrelated tasks.
- Hidden shared mutable state between transformers.
- Large transformers that duplicate logic from others.

**Prompts & Examples for LLMs to Generate Transformers**
- Ask the LLM to output a transformer as a single pure function with explicit input/output examples.
- Request a minimal test case alongside the transformer.

**References & Further Reading**
- Pipes and Filters architectural pattern
- Functional programming composition

---

If you want, I can:
- Add concrete TypeScript examples and types.
- Generate a JSON Schema set for a sample pipeline.
- Create small unit tests for the example transformers.
