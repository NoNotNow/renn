/**
 * Bilingual API reference for custom transformer docs (EN/DE stay in sync).
 * Signatures match `transformerCodeDecl.ts` / runtime `TransformerRuntimeApi`.
 */

import type { ApiDocParam } from './apiParamDocs'
import { API_PARAMS } from './apiParamDocs'
import { attachApiExample } from './transformerApiExamples'

export interface ApiDocRow {
  name: string
  /** Full identifier for search indexing. */
  signature: string
  /** Display name for methods (e.g. `api.vec.add`); defaults to signature. */
  callName?: string
  type?: string
  en: string
  de: string
  params?: ApiDocParam[]
  fieldLabelEn?: string
  fieldLabelDe?: string
  /** Short JS usage snippet (syntax-highlighted in docs). */
  example?: string
}

export interface ApiDocSection {
  id: string
  titleEn: string
  titleDe: string
  introEn?: string
  introDe?: string
  rows: ApiDocRow[]
}

export const TRANSFORM_FUNCTION_SIGNATURE = `function transform(input, dt, params, state, api) {
  return { /* TransformOutput fields, or {} */ };
}`

export const TRANSFORM_FUNCTION_INTRO = {
  en: 'Runs once per physics step. You may read and mutate `input` (especially `input.actions`), use `state` for timers, and return physics output or `{}`.',
  de: 'Wird in jedem Simulationsschritt einmal aufgerufen. Du kannst `input` lesen und ändern (z. B. `input.actions`), `state` für Timer nutzen und eine Physik-Ausgabe oder `{}` zurückgeben.',
}

export const TRANSFORM_INPUT_SECTION: ApiDocSection = {
  id: 'transform-input',
  titleEn: 'TransformInput (`input`)',
  titleDe: 'TransformInput (`input`)',
  introEn:
    'Snapshot of the entity this frame. Earlier transformers in the chain may already have changed `actions` or `target`.',
  introDe:
    'Alle Infos zum Objekt in diesem Schritt. Frühere Transformer können `actions` oder `target` schon geändert haben.',
  rows: [
    {
      name: 'actions',
      signature: 'actions',
      type: 'Record<string, number>',
      fieldLabelEn: 'Semantic controls',
      fieldLabelDe: 'Steuerwerte',
      en: 'Named axes (e.g. throttle, steer_left). Usually 0–1 or −1–1. Safe read: `api.getAction(input, "name")`.',
      de: 'Steuerwerte (z. B. throttle, steer_left). Meist 0–1 oder −1–1. Sicher lesen mit `api.getAction(input, "name")`.',
    },
    {
      name: 'position',
      signature: 'position',
      type: 'Vec3',
      fieldLabelEn: 'World position',
      fieldLabelDe: 'Position',
      en: 'Location `[x, y, z]` in metres.',
      de: 'Ort `[x, y, z]` in Metern.',
    },
    {
      name: 'rotation',
      signature: 'rotation',
      type: 'Rotation',
      fieldLabelEn: 'Orientation',
      fieldLabelDe: 'Ausrichtung',
      en: 'Euler angles `[x, y, z]` in radians (−Z = forward).',
      de: 'Euler-Winkel `[x, y, z]` in Radiant (−Z = vorwärts).',
    },
    {
      name: 'velocity',
      signature: 'velocity',
      type: 'Vec3',
      fieldLabelEn: 'Linear velocity',
      fieldLabelDe: 'Lineare Geschwindigkeit',
      en: 'Speed in m/s. Tuple — use `api.vec.*`, not methods on the tuple.',
      de: 'Geschwindigkeit in m/s. Drei Zahlen `[x, y, z]` — nutze `api.vec.*`, nicht Methoden am Tupel.',
    },
    {
      name: 'angularVelocity',
      signature: 'angularVelocity',
      type: 'Vec3',
      fieldLabelEn: 'Angular velocity',
      fieldLabelDe: 'Winkelgeschwindigkeit',
      en: 'Rotation speed in rad/s.',
      de: 'Drehgeschwindigkeit in rad/s.',
    },
    {
      name: 'accumulatedForce',
      signature: 'accumulatedForce',
      type: 'Vec3',
      fieldLabelEn: 'Accumulated force',
      fieldLabelDe: 'Summierte Kraft',
      en: 'Forces from earlier transformers in this frame (before your output).',
      de: 'Kräfte von früheren Transformern in diesem Schritt (vor deiner Ausgabe).',
    },
    {
      name: 'accumulatedTorque',
      signature: 'accumulatedTorque',
      type: 'Vec3',
      fieldLabelEn: 'Accumulated torque',
      fieldLabelDe: 'Summiertes Drehmoment',
      en: 'Torques from earlier transformers in this frame.',
      de: 'Drehmomente von früheren Transformern in diesem Schritt.',
    },
    {
      name: 'environment',
      signature: 'environment',
      type: 'EnvironmentState',
      fieldLabelEn: 'Environment',
      fieldLabelDe: 'Umgebung',
      en: 'Contacts and ground info from physics (see below).',
      de: 'Kontakt- und Bodeninfos aus der Physik (siehe unten).',
    },
    {
      name: 'deltaTime',
      signature: 'deltaTime',
      type: 'number',
      fieldLabelEn: 'Timestep',
      fieldLabelDe: 'Zeitschritt',
      en: 'Same as `dt` — duration of this step in seconds.',
      de: 'Gleich wie `dt` — Dauer dieses Schritts in Sekunden.',
    },
    {
      name: 'entityId',
      signature: 'entityId',
      type: 'string',
      fieldLabelEn: 'Entity id',
      fieldLabelDe: 'Objekt-ID',
      en: 'Id of the entity this transformer runs on.',
      de: 'ID des Objekts, für das dieser Transformer läuft.',
    },
    {
      name: 'target',
      signature: 'target?',
      type: 'TransformTarget',
      fieldLabelEn: 'Movement target',
      fieldLabelDe: 'Bewegungsziel',
      en: 'Optional goal from targetPoseInput, follow, wanderer, etc. Last writer in the chain wins.',
      de: 'Optionales Ziel (von targetPoseInput, follow, wanderer …). Der zuletzt schreibende Transformer setzt den Wert.',
    },
  ],
}

export const ENVIRONMENT_STATE_ROWS: ApiDocRow[] = [
  {
    name: 'isGrounded',
    signature: 'isGrounded?',
    type: 'boolean',
    fieldLabelEn: 'On ground',
    fieldLabelDe: 'Auf Boden',
    en: 'True when resting on counted ground surfaces.',
    de: 'Wahr, wenn das Objekt auf dem Boden steht.',
  },
  {
    name: 'groundNormal',
    signature: 'groundNormal?',
    type: 'Vec3',
    fieldLabelEn: 'Ground normal',
    fieldLabelDe: 'Boden-Normale',
    en: 'Surface normal at the main ground contact.',
    de: 'Richtung der Bodenfläche am Kontaktpunkt.',
  },
  {
    name: 'isTouchingObject',
    signature: 'isTouchingObject?',
    type: 'boolean',
    fieldLabelEn: 'Touching collider',
    fieldLabelDe: 'Kollision',
    en: 'True when touching any other collider (car2 gates on this).',
    de: 'Wahr, wenn das Objekt ein anderes berührt (car2 prüft das).',
  },
  {
    name: 'supportVelocity',
    signature: 'supportVelocity?',
    type: 'Vec3',
    fieldLabelEn: 'Support velocity',
    fieldLabelDe: 'Träger-Geschwindigkeit',
    en: 'Velocity of the supporting surface (moving platforms). Missing when airborne.',
    de: 'Geschwindigkeit der tragenden Fläche (bewegte Plattformen). Fehlt in der Luft.',
  },
  {
    name: 'wind',
    signature: 'wind?',
    type: 'Vec3',
    fieldLabelEn: 'Wind',
    fieldLabelDe: 'Wind',
    en: 'Optional ambient wind vector (world space).',
    de: 'Optionaler Wind-Vektor (Weltkoordinaten).',
  },
]

export const TRANSFORM_TARGET_ROWS: ApiDocRow[] = [
  {
    name: 'pose',
    signature: 'target.pose',
    type: '{ position, rotation }',
    fieldLabelEn: 'Goal pose',
    fieldLabelDe: 'Ziel-Pose',
    en: 'Goal position and rotation in world space.',
    de: 'Ziel-Position und -Rotation in Weltkoordinaten.',
  },
  {
    name: 'speed',
    signature: 'target.speed',
    type: 'number',
    fieldLabelEn: 'Goal speed',
    fieldLabelDe: 'Ziel-Geschwindigkeit',
    en: 'Linear speed toward the goal in m/s (not turn rate).',
    de: 'Lineare Geschwindigkeit zum Ziel in m/s (keine Drehgeschwindigkeit).',
  },
]

export const TRANSFORM_OUTPUT_SECTION: ApiDocSection = {
  id: 'transform-output',
  titleEn: 'TransformOutput (return value)',
  titleDe: 'TransformOutput (Rückgabewert)',
  introEn:
    'Return `{}` when you only changed `input.actions`. Force, impulse, and torque add up in the chain; color, addRotation, and setPose use last-wins.',
  introDe:
    'Gib `{}` zurück, wenn du nur `input.actions` geändert hast. force, impulse und torque werden addiert; bei color, addRotation und setPose zählt der letzte Wert.',
  rows: [
    {
      name: 'force',
      signature: 'force?',
      type: 'Vec3',
      fieldLabelEn: 'Force',
      fieldLabelDe: 'Kraft',
      en: 'Continuous force this step (N). Reset each frame by the runtime before the chain.',
      de: 'Dauerhafte Kraft in diesem Schritt (N). Wird vor jedem Durchlauf zurückgesetzt.',
    },
    {
      name: 'impulse',
      signature: 'impulse?',
      type: 'Vec3',
      fieldLabelEn: 'Impulse',
      fieldLabelDe: 'Impuls',
      en: 'Instant push (N·s). Merged into the chain force slot.',
      de: 'Kurzer Stoß (N·s). Wird zur Kraft-Summe der Kette addiert.',
    },
    {
      name: 'torque',
      signature: 'torque?',
      type: 'Vec3',
      fieldLabelEn: 'Torque',
      fieldLabelDe: 'Drehmoment',
      en: 'Continuous torque this step.',
      de: 'Drehmoment in diesem Schritt.',
    },
    {
      name: 'linvel',
      signature: 'linvel?',
      type: 'Vec3',
      fieldLabelEn: 'Linear velocity override',
      fieldLabelDe: 'Geschwindigkeit überschreiben',
      en: 'Set linear velocity directly — use only when you need a hard override.',
      de: 'Setzt die lineare Geschwindigkeit direkt — nur wenn du sie bewusst überschreiben willst.',
    },
    {
      name: 'addRotation',
      signature: 'addRotation?',
      type: 'Rotation | null',
      fieldLabelEn: 'Rotation delta',
      fieldLabelDe: 'Zusätzliche Drehung',
      en: 'Euler delta added after the step (rad). `null` clears intent.',
      de: 'Zusätzliche Drehung nach dem Schritt (Radiant). `null` hebt sie auf.',
    },
    {
      name: 'setPose',
      signature: 'setPose?',
      type: '{ position, rotation }',
      fieldLabelEn: 'Set pose',
      fieldLabelDe: 'Pose setzen',
      en: 'Teleport to a pose (kinematic bodies). Last-wins; zeros velocity.',
      de: 'Setzt Position und Ausrichtung (kinematische Körper). Der letzte Wert zählt; Geschwindigkeit wird null.',
    },
    {
      name: 'color',
      signature: 'color?',
      type: 'Vec3',
      fieldLabelEn: 'Mesh color',
      fieldLabelDe: 'Farbe',
      en: 'Tint `[r, g, b]` with channels 0–1.',
      de: 'Färbung `[r, g, b]`, Kanäle 0–1.',
    },
    {
      name: 'earlyExit',
      signature: 'earlyExit?',
      type: 'boolean',
      fieldLabelEn: 'Stop chain',
      fieldLabelDe: 'Kette stoppen',
      en: 'Stop running later transformers this frame.',
      de: 'Stoppt weitere Transformer in diesem Schritt.',
    },
  ],
}

export const API_VEC_SECTION: ApiDocSection = {
  id: 'api-vec',
  titleEn: 'Vector helpers (`api.vec`)',
  titleDe: 'Hilfsfunktionen für Vektoren (`api.vec`)',
  introEn: '`Vec3` is always a tuple `[x, y, z]`. These helpers work on tuples — no `.length()` on the tuple itself.',
  introDe: '`Vec3` ist immer ein Tupel `[x, y, z]`. Nutze die Hilfsfunktionen — das Tupel selbst hat keine Methoden wie `.length()`.',
  rows: [
    {
      name: 'add',
      signature: 'api.vec.add(a, b)',
      callName: 'api.vec.add',
      type: 'Vec3',
      params: [API_PARAMS.a, API_PARAMS.b],
      en: 'Component-wise sum.',
      de: 'Komponentenweise addieren.',
    },
    {
      name: 'subtract',
      signature: 'api.vec.subtract(a, b)',
      callName: 'api.vec.subtract',
      type: 'Vec3',
      params: [API_PARAMS.a, API_PARAMS.b],
      en: 'Component-wise difference a − b.',
      de: 'Komponentenweise a − b.',
    },
    {
      name: 'scale',
      signature: 'api.vec.scale(v, s)',
      callName: 'api.vec.scale',
      type: 'Vec3',
      params: [API_PARAMS.v, API_PARAMS.s],
      en: 'Multiply each component by scalar s.',
      de: 'Jede Komponente mit s multiplizieren.',
    },
    {
      name: 'length',
      signature: 'api.vec.length(v)',
      callName: 'api.vec.length',
      type: 'number',
      params: [API_PARAMS.v],
      en: 'Euclidean length of the vector.',
      de: 'Länge des Vektors.',
    },
    {
      name: 'normalize',
      signature: 'api.vec.normalize(v)',
      callName: 'api.vec.normalize',
      type: 'Vec3',
      params: [API_PARAMS.v],
      en: 'Unit vector in the same direction; `[0,0,0]` when length is near zero.',
      de: 'Einheitsvektor in gleicher Richtung; bei fast Null → `[0,0,0]`.',
    },
    {
      name: 'dot',
      signature: 'api.vec.dot(a, b)',
      callName: 'api.vec.dot',
      type: 'number',
      params: [API_PARAMS.a, API_PARAMS.b],
      en: 'Dot product.',
      de: 'Skalarprodukt.',
    },
    {
      name: 'cross',
      signature: 'api.vec.cross(a, b)',
      callName: 'api.vec.cross',
      type: 'Vec3',
      params: [API_PARAMS.a, API_PARAMS.b],
      en: 'Cross product a × b (right-handed).',
      de: 'Kreuzprodukt a × b (Rechtssystem).',
    },
    {
      name: 'getForwardVector',
      signature: 'api.vec.getForwardVector(rotation)',
      callName: 'api.vec.getForwardVector',
      type: 'Vec3',
      params: [API_PARAMS.rotation],
      en: 'Unit forward from Euler (−Z facing). Same as `api.getForwardVector`.',
      de: 'Einheits-Vektor vorwärts aus Euler (−Z). Wie `api.getForwardVector`.',
    },
    {
      name: 'getUpVector',
      signature: 'api.vec.getUpVector(rotation)',
      callName: 'api.vec.getUpVector',
      type: 'Vec3',
      params: [API_PARAMS.rotation],
      en: 'Unit up from Euler (+Y). Same as `api.getUpVector`.',
      de: 'Einheits-Vektor nach oben (+Y). Wie `api.getUpVector`.',
    },
    {
      name: 'getForwardSpeed',
      signature: 'api.vec.getForwardSpeed(velocity, forward)',
      callName: 'api.vec.getForwardSpeed',
      type: 'number',
      params: [API_PARAMS.velocity, API_PARAMS.forward],
      en: 'Signed speed along `forward` (positive = forward). Prefer unit `forward`.',
      de: 'Vorzeichenbehaftete Geschwindigkeit entlang `forward` (+ = vorwärts). `forward` am besten normalisieren.',
    },
    {
      name: 'projectOntoPlane',
      signature: 'api.vec.projectOntoPlane(vec, planeNormal)',
      callName: 'api.vec.projectOntoPlane',
      type: 'Vec3',
      params: [API_PARAMS.vec, API_PARAMS.planeNormal],
      en: 'Project onto the plane ⊥ normal — use entity up on slopes, `[0,1,0]` for flat ground.',
      de: 'Auf die Ebene senkrecht zur Normalen projizieren — am Hang die Oben-Richtung des Objekts, auf flachem Boden `[0,1,0]`.',
    },
    {
      name: 'rotateAroundAxis',
      signature: 'api.vec.rotateAroundAxis(vec, axis, angle)',
      callName: 'api.vec.rotateAroundAxis',
      type: 'Vec3',
      params: [API_PARAMS.vec, API_PARAMS.axis, API_PARAMS.angle],
      en: 'Rotate vector by `angle` radians around `axis`.',
      de: 'Vektor um `angle` Radiant um `axis` drehen.',
    },
    {
      name: 'offsetAlong',
      signature: 'api.vec.offsetAlong(origin, direction, distance)',
      callName: 'api.vec.offsetAlong',
      type: 'Vec3',
      params: [API_PARAMS.origin, API_PARAMS.direction, API_PARAMS.distance],
      en: '`origin + direction * distance` — e.g. probe point in front of the car.',
      de: '`origin + direction * distance` — z. B. Messpunkt vor dem Auto.',
    },
    {
      name: 'angleBetween',
      signature: 'api.vec.angleBetween(from, to)',
      callName: 'api.vec.angleBetween',
      type: 'number',
      params: [API_PARAMS.from, API_PARAMS.to],
      en: 'Unsigned angle in radians (0 … π). Normalize inputs for stable results.',
      de: 'Winkel ohne Vorzeichen in Radiant (0 … π). Eingaben normalisieren.',
    },
    {
      name: 'signedAngleAroundAxis',
      signature: 'api.vec.signedAngleAroundAxis(from, to, axis)',
      callName: 'api.vec.signedAngleAroundAxis',
      type: 'number',
      params: [API_PARAMS.from, API_PARAMS.to, API_PARAMS.axis],
      en: 'Signed turn angle around `axis` — positive/negative = left vs right on slopes.',
      de: 'Vorzeichen-Winkel um `axis` — positiv/negativ = links/rechts (auch an Hängen).',
    },
    {
      name: 'rightFromForward',
      signature: 'api.vec.rightFromForward(forward, upHint?)',
      callName: 'api.vec.rightFromForward',
      type: 'Vec3',
      params: [API_PARAMS.forward, API_PARAMS.upHint],
      en: 'Unit vector to the right of `forward`; default upHint = world +Y.',
      de: 'Einheits-Vektor rechts von `forward`; Standard upHint = Welt +Y.',
    },
  ],
}

export const API_RUNTIME_SECTION: ApiDocSection = {
  id: 'api-runtime',
  titleEn: 'Runtime API (`api`)',
  titleDe: 'Laufzeit-API (`api`)',
  introEn:
    'Frozen helper object — no imports in saved code. Top-level vector aliases (`addVec3`, …) match `api.vec.*`. Invalid args throw `[TransformerRuntimeApi.…]` errors.',
  introDe:
    'Fertige Hilfsfunktionen — im gespeicherten Code brauchst du keine imports. Kurzformen wie `addVec3` entsprechen `api.vec.*`. Falsche Werte lösen Fehler mit `[TransformerRuntimeApi.…]` aus.',
  rows: [
    {
      name: 'getAction',
      signature: 'api.getAction(input, name)',
      callName: 'api.getAction',
      type: 'number',
      params: [API_PARAMS.input, API_PARAMS.name],
      en: 'Returns `input.actions[name] ?? 0`.',
      de: 'Liefert `input.actions[name] ?? 0`.',
    },
    {
      name: 'getForwardVector',
      signature: 'api.getForwardVector(rotation)',
      callName: 'api.getForwardVector',
      type: 'Vec3',
      params: [API_PARAMS.rotation],
      en: 'Same as `api.vec.getForwardVector`.',
      de: 'Wie `api.vec.getForwardVector`.',
    },
    {
      name: 'getUpVector',
      signature: 'api.getUpVector(rotation)',
      callName: 'api.getUpVector',
      type: 'Vec3',
      params: [API_PARAMS.rotation],
      en: 'Same as `api.vec.getUpVector`.',
      de: 'Wie `api.vec.getUpVector`.',
    },
    {
      name: 'addVec3',
      signature: 'api.addVec3(a, b)',
      callName: 'api.addVec3',
      type: 'Vec3',
      params: [API_PARAMS.a, API_PARAMS.b],
      en: 'Alias for `api.vec.add`.',
      de: 'Entspricht `api.vec.add`.',
    },
    {
      name: 'subtractVec3',
      signature: 'api.subtractVec3(a, b)',
      callName: 'api.subtractVec3',
      type: 'Vec3',
      params: [API_PARAMS.a, API_PARAMS.b],
      en: 'Alias for `api.vec.subtract`.',
      de: 'Entspricht `api.vec.subtract`.',
    },
    {
      name: 'scaleVec3',
      signature: 'api.scaleVec3(v, s)',
      callName: 'api.scaleVec3',
      type: 'Vec3',
      params: [API_PARAMS.v, API_PARAMS.s],
      en: 'Alias for `api.vec.scale`.',
      de: 'Entspricht `api.vec.scale`.',
    },
    {
      name: 'normalizeVec3',
      signature: 'api.normalizeVec3(v)',
      callName: 'api.normalizeVec3',
      type: 'Vec3',
      params: [API_PARAMS.v],
      en: 'Alias for `api.vec.normalize`.',
      de: 'Entspricht `api.vec.normalize`.',
    },
    {
      name: 'clamp',
      signature: 'api.clamp(value, min, max)',
      callName: 'api.clamp',
      type: 'number',
      params: [API_PARAMS.value, API_PARAMS.min, API_PARAMS.max],
      en: 'Clamp a number to [min, max] inclusive.',
      de: 'Zahl inklusive auf [min, max] begrenzen.',
    },
    {
      name: 'eulerDeltaAroundAxis',
      signature: 'api.eulerDeltaAroundAxis(rotation, axis, angleRad)',
      callName: 'api.eulerDeltaAroundAxis',
      type: 'Rotation',
      params: [API_PARAMS.rotation, API_PARAMS.axis, API_PARAMS.angleRad],
      en: 'Euler rotation delta for a yaw-like turn around a world axis.',
      de: 'Euler-Delta für Drehung um eine Welt-Achse.',
    },
    {
      name: 'raycast',
      signature: 'api.raycast(origin, direction, maxDistance?, options?)',
      callName: 'api.raycast',
      type: 'RaycastResult',
      params: [API_PARAMS.origin, API_PARAMS.direction, API_PARAMS.maxDistance, API_PARAMS.options],
      en: 'Single physics ray. `{ hit, distance, entityId }`. Optional visualize in Builder. Offset origin or filter `entityId` — nothing is excluded automatically.',
      de: 'Ein Strahl in der Physik. Ergebnis: `{ hit, distance, entityId }`. Optional im Builder sichtbar machen. Startpunkt versetzen oder `entityId` filtern — automatisch wird nichts ausgeschlossen.',
    },
    {
      name: 'raycastSpread',
      signature: 'api.raycastSpread(origin, direction, maxDistance, spreadWidth, rayCount, options?)',
      callName: 'api.raycastSpread',
      type: 'RaycastResult',
      params: [
        API_PARAMS.origin,
        API_PARAMS.direction,
        API_PARAMS.maxDistance,
        API_PARAMS.spreadWidth,
        API_PARAMS.rayCount,
        API_PARAMS.options,
      ],
      en: 'Parallel rays spread sideways (bumper width). Closest hit wins; else center ray.',
      de: 'Mehrere parallele Strahlen nebeneinander (z. B. Stoßstangenbreite). Nächster Treffer zählt; sonst der mittlere Strahl.',
    },
    {
      name: 'getWorldPosition',
      signature: 'api.getWorldPosition(id)',
      callName: 'api.getWorldPosition',
      type: 'Vec3 | null',
      params: [API_PARAMS.id],
      en: 'Live position from physics — preferred for hot paths.',
      de: 'Aktuelle Position aus der Physik — sinnvoll, wenn der Code in jedem Schritt läuft.',
    },
    {
      name: 'getStartPosition',
      signature: 'api.getStartPosition(id)',
      callName: 'api.getStartPosition',
      type: 'Vec3 | null',
      params: [API_PARAMS.id],
      en: 'Spawn position from world JSON (not live physics).',
      de: 'Startposition aus der Welt-Datei (nicht die live berechnete Physik).',
    },
    {
      name: 'getEntity',
      signature: 'api.getEntity(id)',
      callName: 'api.getEntity',
      type: 'LiveWorldEntity | undefined',
      params: [API_PARAMS.id],
      en: 'Full entity snapshot + `getLivePosition()`. Heavier — use position helpers when possible.',
      de: 'Viele Objektdaten auf einmal plus `getLivePosition()`. Langsamer — lieber Positions-Helfer nutzen.',
    },
    {
      name: 'log',
      signature: 'api.log(message, durationSeconds?)',
      callName: 'api.log',
      type: 'void',
      params: [API_PARAMS.message, API_PARAMS.durationSeconds],
      en: 'Short message in Play mode (default 4 s). No-op when unwired.',
      de: 'Kurze Meldung beim Spielen (Standard: 4 s). Ohne Anbindung passiert nichts.',
    },
    {
      name: 'visualize',
      signature: 'api.visualize(value, color, name, index)',
      callName: 'api.visualize',
      type: 'void',
      params: [API_PARAMS.numericValue, API_PARAMS.color, API_PARAMS.overlayName, API_PARAMS.index],
      en: 'Builder only: numeric overlay bar. `index` must be integer 1–16. Requires Visualize mode + selection.',
      de: 'Nur im Builder: Zahl als Balken anzeigen. `index` muss 1–16 sein. Braucht Visualize-Modus und Auswahl.',
    },
    {
      name: 'visualizeLine',
      signature: 'api.visualizeLine(from, to, color)',
      callName: 'api.visualizeLine',
      type: 'void',
      params: [API_PARAMS.fromPoint, API_PARAMS.toPoint, API_PARAMS.color],
      en: 'Builder only: line between two world points.',
      de: 'Nur im Builder: Linie zwischen zwei Punkten in der Welt zeichnen.',
    },
  ],
}

export const API_REFERENCE_SECTIONS: ApiDocSection[] = [
  TRANSFORM_INPUT_SECTION,
  TRANSFORM_OUTPUT_SECTION,
  API_VEC_SECTION,
  API_RUNTIME_SECTION,
]

/** Plain-text blob for search indexing */
export function apiReferencePlainText(locale: 'en' | 'de'): string {
  const pick = (en: string, de: string) => (locale === 'de' ? de : en)
  const parts: string[] = [
    pick(TRANSFORM_FUNCTION_INTRO.en, TRANSFORM_FUNCTION_INTRO.de),
    TRANSFORM_FUNCTION_SIGNATURE,
  ]
  for (const section of API_REFERENCE_SECTIONS) {
    parts.push(pick(section.titleEn, section.titleDe))
    if (section.introEn) parts.push(pick(section.introEn, section.introDe ?? ''))
    for (const row of section.rows) {
      const enriched = attachApiExample(row)
      parts.push(enriched.signature, enriched.name, pick(enriched.en, enriched.de))
      if (enriched.example) parts.push(enriched.example)
      for (const p of enriched.params ?? []) {
        parts.push(p.name, pick(p.labelEn, p.labelDe), pick(p.en, p.de))
      }
    }
  }
  for (const row of ENVIRONMENT_STATE_ROWS) {
    const enriched = attachApiExample(row)
    parts.push(enriched.signature, pick(enriched.en, enriched.de))
    if (enriched.example) parts.push(enriched.example)
  }
  for (const row of TRANSFORM_TARGET_ROWS) {
    const enriched = attachApiExample(row)
    parts.push(enriched.signature, pick(enriched.en, enriched.de))
    if (enriched.example) parts.push(enriched.example)
  }
  return parts.join(' ')
}
