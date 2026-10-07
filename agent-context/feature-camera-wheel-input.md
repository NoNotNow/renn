# Camera wheel / pinch / trackpad input

How raw `wheel` events become camera orbit and zoom. Devices differ a lot; this path is **tested with device-shaped event
streams**, not just with a Mac trackpad.

## Pipeline

```
document 'wheel' (capture)  →  WheelClassifier  →  RawWheelState {deltaX, deltaY, pinchDelta, mouseWheelDelta}
  [rawInput.ts, wheelGesture.ts]                      ↓ per frame (sceneFrameLoop)
                                          wheelZoomLog(mousePx, pinchPx) → orbitWheelRef.zoomLog
                                                                           ↓
                                                    CameraController.zoomByLog(ln ratio)
```

- **Normalisation** ([`wheelGesture.ts`](../src/input/wheelGesture.ts)): pixel mode as is, Firefox line mode × 100/3, page mode
  × page height → **one mouse notch = 100 px on every browser/OS** (`WHEEL_NOTCH_PX`).
- **Classification** (`WheelClassifier`, per event, gesture-aware):
  `ctrlKey` → **pinch**; line/page mode → **mouse**; any `deltaX` → **trackpad**; otherwise the first event of a gesture
  (pause ≥ 180 ms) is **mouse** if it is an integer ≥ 40 px, else **trackpad**; the rest of the gesture keeps that kind
  (momentum tails don't flip). Trackpad scroll orbits (`deltaX/deltaY`); mouse wheel and pinch zoom.
- **Ambiguity:** a Mac *external mouse* sends small accelerated pixel steps that look like a trackpad. **View → Mouse wheel**
  (`Auto` / `Always zoom` / `Always orbit`, persisted in `localStorage` `rennWheelBehavior`) overrides the guess for plain
  wheel events. Pinch (ctrl+wheel) is never affected.

## Zoom is multiplicative

`wheelZoom.ts`: a mouse notch scales the camera distance by `exp(±0.12)` (≈ +12.7 % / −11.3 %), pinch by `exp(0.03·px)`,
capped at `exp(±0.6)` per frame. Orbit distance stays clamped to 1–150 m (edit navigation: min 1 m, no max); first person
changes the FOV (40° per unit of ln ratio ≈ 4.8° per notch inside 35–75°).

**Why:** the old mapping was additive and unnormalised — `distance += 0.75 · deltaY` with `deltaY = ±100` per notch (Chrome on
Windows/Linux) = **75 m per notch** against a 1–150 m range. One notch jumped to the limit, so after a few notches only
"very far" and "very near" were left. Trackpads send small deltas and hid the bug. `setOrbitDistanceDelta` (additive metres)
still exists for scripted use; input devices use `zoomByLog`.

## Tests

- [`wheelGesture.test.ts`](../src/input/wheelGesture.test.ts) — device streams: Chrome/Windows ±100 (also ×1.2/1.5 display scaling),
  Firefox lines, spun wheel, trackpad swipe + momentum, pinch, Mac-mouse ambiguity + override.
- [`wheelZoom.test.ts`](../src/input/wheelZoom.test.ts) — fixed percentage per notch, reversible (200× in/out returns to 10 m),
  limits, 1 m start, first person, edit navigation.
- [`wheelPipeline.test.ts`](../src/input/wheelPipeline.test.ts) — DOM events → hook → zoom → `CameraController` for each device.
- Texture Maker preview zoom uses the same normalisation (`useTextureMakerViewNav.ts`, ≈ 8 % per notch).

## Fractional notches on scaled displays (2026-10-07)

Chrome reports wheel deltas in CSS px, so a 100-device-px notch is 75.19 / 66.67 / 80 … at DPR 1.33 / 1.5 / 1.25 (or with browser
zoom ≠ 100 %). The classifier required an *integer* `deltaY ≥ 40` for a fresh pixel-mode notch, so those notches were taken for
a trackpad swipe and **orbited instead of zooming**. `isWholeDevicePixels(deltaY, devicePixelRatio)` now accepts a delta that is a
whole number of device pixels (`rawInput.ts` passes `window.devicePixelRatio`). Verified in Chromium (Playwright, DPR 1.33,
`mouse.wheel`): zoom in/out returns to the start view; before the fix the same events pitched the camera to top view.
