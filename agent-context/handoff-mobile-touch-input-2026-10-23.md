# Handoff — mobile touch input: camera gestures on phones (2026-10-23)

**Status: round 2 shipped** — root cause found and fixed: it was never an input/gesture bug. At phone width the Builder's two side drawers (240 px + 300 px, full-height, `pointer-events: auto`) overlap and cover **100% of the scene canvas** — every touch landed on sidebar UI, so the camera recognizer never saw a pointerdown. Verified under real phone emulation (WebKit + Chromium, production build): 640/640 sampled canvas points hit builder chrome before the fix. The wheel strip kept working because it sits above the drawers in the HUD of the *Play* layout / a drawer-closed Builder. Fix: drawers default to collapsed below 760 px viewport (`drawersOpenByDefault` in `useBuilderFullscreenChrome.ts`); stored prefs still win. Also added an iOS `gesturestart`/`gesturechange` preventDefault belt to `touchCameraGestures.ts`. Round 1 + wheels stay as shipped below; do not regenerate the settled decisions.

**Device-parity suite (production build, phone layout): `e2e/touch-camera-mobile.spec.ts` + `playwright.touch.config.ts`** — serves the real `vite build` via `vite preview` (the gh-pages artifact, which the old dev-server spec never tested) under `devices['iPhone 13']` in both engines:
- fresh phone session must keep the canvas ≥90% touchable (regression test for the drawer default),
- CDP multitouch two-finger drag + pinch against the production bundle (moves reach the scene container, never pointercancel, camera pixels change).
Run: `npm run build && npx playwright test --config playwright.touch.config.ts` (CDP tests auto-skip on the WebKit project).

**If the phone still shows dead canvas gestures after round 2:** first compare the build fingerprint — Builder header shows `build <sha>` (the deployed commit's short SHA). If it doesn't match the deployed `main`/branch tip, Safari is serving a stale gh-pages bundle: fully close the tab and reload (gh-pages caches `index.html` ~10 min; iOS Safari can hold it much longer in resurrected tabs). The wheel strip works in every iteration, so it proves nothing about bundle freshness — round 1's `touch-action` bug (dead canvas + working wheel) is exactly what a stale round-1 bundle shows.

## Settled decisions (grilling session — do not reopen)

- Scope: drive + camera only. No play/build behaviour changes, no selection, no exit buttons, no orientation handling.
- Touch vocabulary (touch pointers only — trackpad/mouse paths untouched):
  - 1 finger: inert (reserved for future touch selection on the canvas).
  - 2-finger drag = orbit, 2-finger pinch = zoom (into the same sinks as the trackpad: `setOrbitDelta`, `zoomByLog`).
- HUD steering wheel: activation stays via the existing HUD menu entry. Touch drag on the visible strip = analog axes (up = throttle, down = brake, left/right = steer; offset from touch-down, intensity = drag distance, lift = release, car2 self-centers). One primary finger owns the strip. Wheel finger + canvas fingers work simultaneously.
- Trackpad behaves the same as touch (one finger = cursor, two fingers orbit) and is untouched.

## Implementation map (seams, no migration for saved worlds)

- `src/input/touchCameraGestures.ts` — recognizer: latched two-finger orbit/pinch decision, inert leftover finger, skips pointers starting in `[data-touch-input-sink]`, container-level non-passive `touchmove` preventDefault (belt and braces, below).
- `src/input/touchDriveInput.ts` (new) — wheel strip → analog `RawDriveTouchState` (steer/drive), single primary pointer, dead zone 0.05, full deflection at 0.32 × strip width.
- `src/input/inputMapping.ts` — touch block in `applyInputMappingInto`: writes `steering_angle` (positive = LEFT, like key `a`) plus forward/backward values derived from `mapping.keyboard.w`/`.s`. Touch is deliberately NOT in the persisted `inputMapping` JSON, so saved worlds drive without migration.
- `src/types/transformer.ts` — `RawDriveTouchState`, `RawInput.touch?`, and `hasTrackedKeyboardActivity` also returns true on touch (wake-on-input for sleeping car2 bodies).
- `src/components/GameHud.tsx` — wheel strip gets refs + `pointerEvents: 'auto'` (the overlay root stays `none`); `src/components/SceneView.tsx` forwards `touchDriveRef`.
- `src/runtime/sceneFrameLoop.ts` + `sceneRuntimeSession*.ts` — `touchDriveRef` threaded into `getRawInputSnapshot` (optional 3rd arg; the headless path passes nothing).
- `e2e/touch-camera.spec.ts` — device-parity spec (below).

## Fixes so far (why canvas touches were dead on the phone while the wheel worked)

1. `fdd9dd4e`: `touch-action: none` on the renderer canvas itself (`sceneRuntimeSessionLoad.ts`). Touch-action is not inherited — the gesture container's `none` was defeated by the unstyled `domElement` child, so iOS pointercancelled the finger on the first move.
2. `de79ff6c`: belt and braces — non-passive container-level `touchmove` `preventDefault()`, killing browser gesture take-over in any iOS version regardless of touch-action handling. `touchstart` is untouched, so tap-to-select clicks survive; the wheel strip drag is also covered. Nothing inside the scene container needs native panning.

Important context: the Chromium headless repro passes end to end (real CDP multitouch, moves stream, no pointercancel, camera pixels change). So if a phone still shows dead canvas gestures on `de79ff6c`, suspect (a) Safari serving a stale bundle (gh-pages caches index.html ~10 min; Safari longer — hard refresh / fully close the tab), or (b) an iOS Safari-specific pointer quirk.

## Device-parity spec: `e2e/touch-camera.spec.ts`

Reproduces real phone input: CDP `Input.dispatchTouchEvent` (synthetic `dispatchEvent` PointerEvents would bypass the gesture-cancellation behaviour this spec exists to catch). Asserts touch pointer moves stream, pointercancel never fires, and the canvas pixels change for both two-finger drag and pinch. Run: `npx playwright test e2e/touch-camera.spec.ts`.

## Tuning knobs (adjust from the user's device feedback, not preemptively)

- Wheel feel: `deflectionRadius` in `touchDriveInput.ts` (0.32 × strip width), dead zone 0.05.
- Gesture classification: `DECIDE_TRAVEL_PX` (6) and `STATIC_ANCHOR_TRAVEL_PX` (30) in `touchCameraGestures.ts`; latched once per gesture, decision frame emits the cumulative delta.

## Next agent: if orbit/pinch is still dead on device

1. First rule out the cached bundle (ask the user to hard-refresh; compare a fingerprint, e.g. console.log a build marker added temporarily).
2. Instrument live counters around `pointerIsClaimed`, the sink skip, and travel thresholds in `touchCameraGestures.ts`; check whether a `pointermove` stream arrives at all and whether `pointercancel` fires.
3. Do NOT touch the desktop trackpad/wheel paths (`WheelClassifier`, `wheelZoom`, `rawMouseDrag`) — they are settled and desktop-verified.
4. Round-2 addition: verify the touch actually reaches the canvas — `document.elementFromPoint(x, y)` at the finger position. In the Builder at phone width, drawers cover the canvas by default (see `e2e/touch-camera-mobile.spec.ts`'s `canvasHitFraction`); on `/play` the canvas is always full-bleed.
