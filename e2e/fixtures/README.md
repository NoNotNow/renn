# E2E fixtures (GLB / world ZIP)

## Giraffe performance-booster tests

1. Copy your `giraffe.glb` into this folder as `giraffe.glb`.
2. Run `npm run test:build-fixtures` to generate `giraffe-world.zip`.
3. Run `npm run test:e2e -- e2e/performance-booster-giraffe.spec.ts`.

If `giraffe-world.zip` is missing, the giraffe E2E suite is skipped.

`giraffe-world.json` describes a static trimesh entity that references asset id `giraffe-test-asset`; the ZIP bundles `world.json` and `assets/giraffe-test-asset.glb`.
