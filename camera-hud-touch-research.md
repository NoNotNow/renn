# Mobile playability research: camera, drive input, steering-wheel HUD, mobile readiness

Repo: /Users/manuelgilbertriviere/Documents/Dev/renn (Vite + React + plain Three.js; no React Three Fiber, no OrbitControls). Research only — no code modified.

## 1. Camera controls

- Renderer: plain Three.js `THREE.WebGLRenderer` (src/runtime/sceneRuntimeSessionLoad.ts:62). No `three/examples` OrbitControls anywhere (`grep OrbitControls src` = 0 hits). Camera is a custom controller: src/camera/cameraController.ts (662 lines) — orbit via `setOrbitDelta(dx, dy)` (px), zoom via `zoomByLog(log)`, free-fly via `setFreeFlyInput(keys)` (src/camera/cameraController.ts:227-238).
- Trackpad/wheel capture: src/input/rawInput.ts:168-217 `useRawWheelInput(containerRef)` — `document.addEventListener('wheel', onWheel, { passive: false, capture: true })` (line ~209). Classifies each event via `WheelClassifier` (src/input/wheelGesture.ts:63-89): `ctrlKey` → 'pinch' (trackpad pinch, src/input/wheelGesture.ts:66), line/page deltaMode or ∆≥40 whole-device px → 'mouse', else two-finger scroll → 'trackpad'. User override persisted in localStorage (`rennWheelBehavior`, src/input/wheelGesture.ts:93-111; View → Mouse wheel menu, src/components/BuilderHeader.tsx:328-330).
- Units: all wheel deltas normalized to CSS px per notch=100 — `normalizeWheelDeltaPx` (src/input/wheelGesture.ts:17-21), deltaMode 1→×33.3, 2→×pageHeight. Zoom conversion: `wheelZoomLog(mousePx, pinchPx)` = `mousePx/100 × 0.12 + pinchPx × 0.03`, clamped to ±0.6/frame (src/input/wheelZoom.ts:9-21).
- Orbit drag: middle-mouse drag px accumulate in `RawMouseDragState` via `useRawMouseDrag` (src/input/rawMouseDrag.ts:18-70).
- Layer wiring (SceneView): src/components/SceneView.tsx:279 `rawWheelRef = useRawWheelInput(containerRef)`; :281 `orbitWheelRef`; :350 `rawMouseDragRef`. Frame loop (src/runtime/sceneFrameLoop.ts:208-221): in follow-camera or editor-nav mode, `rawWheelRef` deltas are moved into `orbitWheelRef` and `zoomLog = wheelZoomLog(...)`. Then src/runtime/sceneFrameLoop.ts:288-304: `ctrl.setOrbitDelta(orbitDx, orbitDy)` and `ctrl.zoomByLog(orbitWheel.zoomLog)`; both refs are reset (consumed) per frame.
- macOS swipe-back prevention: src/input/preventSwipeNavigation.ts:35-46 — document capture-phase wheel listener, `preventDefault` on horizontal (deltaX>deltaY) swipes outside scrollable regions.
- Touch ALREADY EXISTS for the 3D viewport: src/input/touchCameraGestures.ts — `useTouchCameraGestures(containerRef, {orbitDragRef, wheelRef, isBlocked})` (installed in src/components/SceneView.tsx:354-358). 1-finger drag → orbit (feeds `rawMouseDragRef`, same px deltas as middle-mouse); 2-finger pinch → zoom (`pinchDelta += pinchPx`, same field trackpad pinch uses); pointerdown on container, move/up/cancel on window; only `pointerType === 'touch'`; suppressed when gizmo drags (`isBlocked: () => gizmoDraggingRef.current`). 2-finger pan NOT implemented ("CameraController has no pan primitive", header comment). Second consumer of the same recognizer: TextureMaker preview (src/components/TextureMaker/preview/useTextureMakerViewNav.ts:77).
- Canvas host has `touchAction: 'none'` and `overscrollBehavior: 'none'` (src/components/SceneView.tsx:938-941).

## 2. WASD drive controls

- Capture: window-level `keydown`/`keyup` + `blur` set boolean flags in a ref — `useRawKeyboardInput` (src/input/rawInput.ts:62-152; w/a/s/d/space/shift via `e.code`, skipped in editable contexts via `isKeyboardEventInEditableContext`, src/input/rawInput.ts:46-56).
- Semantic mapping: `applyInputMappingInto(rawInput, mapping, out, clear)` (src/input/inputMapping.ts:27-79) — held keyboard keys write `kbSensitivity` (1.0) into named actions; wheel deltas map to −1..1 axes. Presets in src/input/inputPresets.ts; car preset (`CAR_PRESET`, :54-63): `w→throttle, s→brake, a→steer_left, d→steer_right, space→jump` (all binary ±1).
- Consumption chain: per frame, sceneFrameLoop snapshot `getRawInputSnapshot(rawKeyboardRef, rawWheelRef)` → `registry.setRawInputGetter` (src/runtime/sceneFrameLoop.ts:241-245); `InputTransformer.transform` runs first each frame and fills `input.actions` via `applyInputMappingInto` (src/transformers/presets/inputTransformer.ts:87-97), gated to the active play avatar via `controlledEntityIdRef` (:39, :49-53).
- Physics meaning (Car2Transformer, src/transformers/presets/car2Transformer.ts): `throttle − brake` → force along forward × `params.power` (:133-136); steering via `wheelAngle` state −1..1 (:57): actions `steer_left`/`steer_right` increment/decrement it by `steeringSpeed` per frame with speed-based slowdown and self-centering (:176-213); yaw force then derives from `wheelAngle` (:90, :112-118).
- IMPORTANT: car2 also accepts a direct **`steering_angle`** action in −1..1 which sets the target wheel angle with rate limiting (:176-187) — a ready-made analog channel a touch UI (or HUD drag) could feed.
- Shared abstraction: YES, it is not hard-wired to events. Drive input is a plain per-frame `RawInput` snapshot (booleans + wheel px) injected via `rawInputGetter`. Touch controls can either (a) flip `rawKeyboardRef.current` booleans (ref is exposed in SceneView:280 and passed to the frame loop, SceneView:287) — note `getRawInputSnapshot` copies keys (src/input/rawInput.ts:230-232) without resetting them, so-held state persists; or (b) add a new axis source in `applyInputMappingInto`, or (c) feed `steering_angle`/analog throttle directly into `input.actions`. Also relevant: keyboard activity gates distance-culling sleep (`hasTrackedKeyboardActivity`, src/runtime/renderItemRegistry.ts:841).
- Separate engine-only free-fly keyboard hook: `useKeyboardInput` (src/hooks/useKeyboardInput.ts:1-76, w/a/s/d translate, arrows rotate, shift=boost ×freeFlyMoveBoost, src/camera/cameraController.ts:459-467, FREE_FLY_MOVE_SPEED=8 at :11) — Builder camera / edit navigation, not the car. Play-mode avatar cycling: +/- keys, src/runtime/sceneRuntimeSessionFrame.ts:261-280. Play→Builder shortcut: Cmd/Ctrl+P (src/hooks/usePlayModeKeyboardShortcuts.ts:9-19) — keyboard-only path off the play page.

## 3. HUD steering wheel

- Component: `GameHud` (src/components/GameHud.tsx:284+) mounted in SceneView when `showGameHud` (src/components/SceneView.tsx:967-969); play page always passes `showGameHud` + `playMode` (src/pages/Play.tsx:110-118).
- Rendering: `SteeringWheelHud` (src/components/GameHud.tsx:253-285) is pure display — a DOM `<img>` of the PNG asset `@/assets/game-hud-steering-wheel.png` rotated by `rotDeg = -wheelAngle * 118`° (STEER_VIS_DEG=118, :44), centered in a 35%-of-canvas-width strip, bottom 40% of the image clipped. Speed is an inline SVG tach (`SpeedTachSvg`, :70-250).
- pointer handlers: NONE — the whole HUD overlay group has `pointerEvents: 'none'` (src/components/GameHud.tsx:389, also :332) and the wheel div is `aria-hidden`.
- State behind it: `wheelAngle` is the Car2Transformer's −1..1 steering state, read per frame by the loop: `reg.getCar2WheelAngle(targetId)` where targetId = camera target entity (src/runtime/sceneFrameLoop.ts:395-417; getter src/runtime/renderItemRegistry.ts:691); pushed to React throttled (`setHudDrive`, SceneView:349, :779). So "dragging the steering wheel" would most naturally map to writing that car2 `wheelAngle` — the transformer already supports an external `steering_angle` action (car2Transformer.ts:176-187) that drives the same state with rate limiting, so a drag can inject analog actions rather than mutate physics state directly.

## 4. Mobile readiness

- Viewport meta: YES — `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` (index.html:6), plus `overscrollBehavior:'none'` + `touchAction:'none'` on the canvas host (SceneView.tsx:938-941).
- No PWA: plain Vite index.html (index.html:1-17); no `manifest` link, no `apple-touch-icon`, no `theme-color` (grep = 0). `public/` holds only exampleWorlds/favicon.svg/global/policy-evolution/world.
- Existing touch handling: touch camera gestures (see §1); pointer handlers for UI exist widely (pointerdown/move): sidebar resize handles, DraggableNumberField, LayerTransformOverlay etc., each with `touchAction:'none'` (src/components/layout/Sidebar.tsx:194, src/components/TextureMaker/LayerTransformOverlay.tsx:133,179, src/components/workspace/FloatingDrawerResizeHandles.tsx:9, ...).
- Fullscreen: implemented for desktop — `RequestFullscreen`/Fullscreen API wrapper with Escape keyboard-lock (`lockEscapeKeyIfSupported`, src/utils/fullscreenApi.ts:13-27) and a `SceneFullscreenButton` (SceneView.tsx:976+); hooked through `useSceneFullscreen`.
- Screen wake lock: `useScreenWakeLock` (src/hooks/useScreenWakeLock.ts:1-60+) — Screen Wake Lock API while playing; used in Play.tsx:51 and Builder.tsx:104. Works on modern mobile browsers; wakes/no-op otherwise.
- Orientation: NO handling anywhere (`screen.orientation` grep = 0 hits).
- iOS Safari hazards related: document-level non-passive wheel capture already handles swipe-back (rawInput.ts:209); no `-webkit-*` touch Overrides CSS (e.g. no `user-select`/`overscroll` on body) found.

## 5. Keyboard-gated affordances

- "Free (WASD)" camera mode option + tooltip "Free fly with WASD; Follow orbits a target entity; Top/Front/Right are axis-aligned." (src/components/entitySidebar/EntityCameraPanel.tsx:227, :241).
- View → Mouse wheel submenu (Auto/Always zoom/Always orbit) — src/components/BuilderHeader.tsx:328-330.
- Play page exits only via keyboard: Cmd/Ctrl+P → Builder (src/hooks/usePlayModeKeyboardShortcuts.ts:1-19) — no on-screen exit button found in GameHud/Play.tsx.
- Drive mapping itself silent in UI: GameHud shows only score/damage/speed/wheel (no key hints); WASD semantics documented only in code comments (SceneView.tsx:113, car2Transformer.ts:2) and Transformer docs.
- Game play avatar selection UI exists? Roster cycling is keyboard-only (`+/-`, sceneRuntimeSessionFrame.ts:255-280 — "Play-mode: +/- keys cycle play avatar when HUD visible and roster has 2+ members") — keyboard gate for multi-avatar worlds.

## Key gaps for mobile play (summary)

1. Drive input: only `keys` booleans from window keydown reach `RawInput`; no touch injection point exists yet (but the ref-based RawInput abstraction makes it feasible — flip `w/a/s/d` booleans or add analog actions).
2. Car2 already exposes an analog `steering_angle` action — natural target for a draggable HUD wheel or on-screen steering.
3. HUD wheel is display-only with `pointerEvents:'none'`; adding drag means enabling pointer events on the wheel strip and writing into the action/raw-input channel.
4. Touch camera works only for editing surfaces wired to `useTouchCameraGestures` (SceneView container); play-mode follow camera already consumes the same wheel/pinch fields, so 1-finger orbit + pinch zoom work in play mode too.
5. No PWA manifest/theme-color/orientation handling; fullscreen button and wake lock already exist.
6. Keyboard-gated UX on the play page: avatar cycling (+/-) and exit (Cmd/Ctrl+P).
