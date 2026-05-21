/**
 * Bilingual explanations for API/code tokens used in transformer authoring docs.
 * German UI keeps English identifiers; explanations live here (tooltips + glossary chapter).
 */

export type TransformerDocsLocale = 'en' | 'de'

export const TRANSFORMER_DOCS_LOCALE_STORAGE_KEY = 'rennTransformerDocsLocale'

export function readStoredTransformerDocsLocale(): TransformerDocsLocale {
  try {
    const v = localStorage.getItem(TRANSFORMER_DOCS_LOCALE_STORAGE_KEY)
    if (v === 'de' || v === 'en') return v
  } catch {
    /* private mode etc. */
  }
  return 'en'
}

export interface TransformerGlossaryEntry {
  /** Exact token as authors type it in code (or short API name). */
  label: string
  en: string
  de: string
}

export const TRANSFORMER_DOCS_GLOSSARY = {
  transform: {
    label: 'transform',
    en: 'Your custom transformer entry function; invoked each physics step with input, dt, params, state, and api.',
    de: 'transform => deine Funktion; kommt bei jedem kleinen Physik-Schritt dran (mit input, dt, params, state, api).',
  },
  TransformInput: {
    label: 'TransformInput',
    en: 'Type of the input snapshot: pose, velocity, environment, semantic actions, optional target, etc.',
    de: 'TransformInput => „Eingabe-Typ“: alles, was reinkommt (Ort, Speed, Boden, Tasten …).',
  },
  TransformOutput: {
    label: 'TransformOutput',
    en: 'Return type: optional force, impulse, torque, linvel, rotation deltas, color, or an empty object.',
    de: 'TransformOutput => „Ausgabe-Typ“: was rauskommt (Schub, Stoß, Drehen, Farbe … oder nichts {}).',
  },
  TransformerRuntimeApi: {
    label: 'TransformerRuntimeApi',
    en: 'Frozen helper object (api): vector math, getAction, visualize, world queries, clamp, log, etc.',
    de: 'TransformerRuntimeApi => Fertig-Rechner & Helfer (Vektoren, Fragen an die Welt, log …).',
  },
  dt: {
    label: 'dt',
    en: 'Simulation timestep in seconds for this physics tick (use with state for timers).',
    de: 'dt => wie lang ein Mini-Zeitschritt ist (Sekunden); gut für Timer: in state immer +dt rechnen.',
  },
  params: {
    label: 'params',
    en: 'JSON parameters from the transformer config (numbers, booleans, nested objects).',
    de: 'params => Extra-Zahlen & Einstellungen aus deinem Transformer-JSON.',
  },
  state: {
    label: 'state',
    en: 'Mutable per-transformer object persisted between frames until the transformer is rebuilt.',
    de: 'state => Merk-Kiste nur für diesen einen Transformer (bleibt, bis die Welt neu lädt).',
  },
  input_object: {
    label: 'input',
    en: 'TransformInput instance for this entity and tick; you may mutate input.actions before downstream transformers run.',
    de: 'input => die Eingabe: was gerade gilt; du darfst z.B. input.actions anfassen.',
  },
  api: {
    label: 'api',
    en: 'Shorthand for TransformerRuntimeApi passed as the fifth argument.',
    de: 'api => Kurzname für den Helfer-Kasten (5. Ding in den Klammern).',
  },
  actions: {
    label: 'actions',
    en: 'Record of semantic control axes (e.g. throttle, steer_left) filled by the input preset or your code.',
    de: 'actions => Steuer-Liste (Gas, Links, Rechts …); füllt Tastatur oder dein Code.',
  },
  throttle: {
    label: 'throttle',
    en: 'Common car semantic action: forward pedal input (0–1 typical). Consumed by car2.',
    de: 'throttle => Gas fürs Auto (0–1); liest das car2.',
  },
  brake: {
    label: 'brake',
    en: 'Common car semantic action: braking input. Consumed by car2.',
    de: 'brake => Bremsen fürs Auto; liest das car2.',
  },
  steer_left: {
    label: 'steer_left',
    en: 'Car semantic action: steer left (−1..1 typical). Consumed by car2.',
    de: 'steer_left => Lenkung nach links; liest das car2.',
  },
  steer_right: {
    label: 'steer_right',
    en: 'Car semantic action: steer right (−1..1 typical). Consumed by car2.',
    de: 'steer_right => Lenkung nach rechts; liest das car2.',
  },
  forward_action: {
    label: 'forward',
    en: 'Example semantic action key (person/input mappings); not built-in—instantiated via input mapping presets.',
    de: "'forward' => Beispiel-Name für Vorwärts; wie er wirklich heißt, steht in deinem Input-Preset.",
  },
  position: {
    label: 'position',
    en: 'World-space translation [x, y, z] in metres on TransformInput.',
    de: 'position => wo das Ding steht [x,y,z] in Metern.',
  },
  rotation: {
    label: 'rotation',
    en: 'Entity orientation as Euler angles [x, y, z] in radians.',
    de: 'rotation => wie gekippt/gedreht [x,y,z] in Radiant.',
  },
  velocity: {
    label: 'velocity',
    en: 'World-space linear velocity (m/s); tuple Vec3.',
    de: 'velocity => wie schnell gerade Bewegung (m/s).',
  },
  angularVelocity: {
    label: 'angularVelocity',
    en: 'World-space angular velocity (rad/s); tuple Vec3.',
    de: 'angularVelocity => wie schnell es sich dreht.',
  },
  Vec3: {
    label: 'Vec3',
    en: 'Three-element numeric tuple [x, y, z] for vectors/points (no methods—use api.vec helpers).',
    de: 'Vec3 => drei Zahlen [x,y,z] (eine Liste, kein Zauber-Knopf).',
  },
  environment: {
    label: 'environment',
    en: 'Contact/ground summaries: grounded flag, normals, touching objects, optional supportVelocity.',
    de: 'environment => Boden ja/nein, Berühren, solche Sachen.',
  },
  EnvironmentState: {
    label: 'EnvironmentState',
    en: 'Type of environment on TransformInput.',
    de: 'EnvironmentState => nur der Typ-Name zu environment.',
  },
  isGrounded: {
    label: 'isGrounded',
    en: 'True when resting on counted ground according to physics filters.',
    de: 'isGrounded => true = steht auf dem Boden (laut Spiel-Physik).',
  },
  groundNormal: {
    label: 'groundNormal',
    en: 'Unit-ish surface normal at primary ground contact.',
    de: 'groundNormal => „oben“ vom Boden weg zeigen.',
  },
  isTouchingObject: {
    label: 'isTouchingObject',
    en: 'True when any collider overlap/contact is reported.',
    de: 'isTouchingObject => true = knallt irgendwo an.',
  },
  force: {
    label: 'force',
    en: 'Continuous force vector (newtons) for this integration step.',
    de: 'force => Schieben wie ein Motor (dauernd in diesem Schritt).',
  },
  impulse: {
    label: 'impulse',
    en: 'Instantaneous impulse Δp = F·Δt (newton-seconds style).',
    de: 'impulse => ein kurzer Stups (einmal kräftig).',
  },
  torque: {
    label: 'torque',
    en: 'Continuous torque axis/strength.',
    de: 'torque => Dreh-Schub (etwas soll sich drehen).',
  },
  linvel: {
    label: 'linvel',
    en: 'Override linear velocity (after chain, clears competing physics for that axis as implemented).',
    de: 'linvel => Bewegungs-Speed hart setzen (sehr stark – vorsicht).',
  },
  addRotation: {
    label: 'addRotation',
    en: 'Euler delta applied post-step (radians); adds to body rotation.',
    de: 'addRotation => noch ein bisschen drehen.',
  },
  color: {
    label: 'color',
    en: 'Optional RGB tint [r,g,b] in 0–1 for feedback rendering.',
    de: 'color => Farbe zum Anzeigen [r,g,b] zwischen 0 und 1.',
  },
  car2: {
    label: 'car2',
    en: 'Built-in vehicle movement preset driven by throttle/brake/steer_* semantic actions.',
    de: 'car2 => eingebautes Auto; will throttle / brake / steer_* lesen.',
  },
  input_preset: {
    label: 'input',
    en: 'Transformer type that maps RawInput/hardware into semantic actions on TransformInput.actions.',
    de: 'input => Preset: Tasten & Co. werden zu actions übersetzt.',
  },
  custom_transformer: {
    label: 'custom',
    en: 'Transformer type whose behavior is authored JavaScript compiled once (Monaco/Code tab).',
    de: 'custom => du schreibst den Code selbst.',
  },
  Monaco: {
    label: 'Monaco',
    en: 'In-browser code editor powering the scripting / transformer code surfaces.',
    de: 'Monaco => das Code-Fenster im Browser.',
  },
  IntelliSense: {
    label: 'IntelliSense',
    en: 'Editor autocompletion and signatures from typings.',
    de: 'IntelliSense => Vorschläge beim Tippen.',
  },
  JSDoc: {
    label: 'JSDoc',
    en: 'Comment tags such as @param that guide JavaScript tooling and Monaco.',
    de: 'JSDoc => Kommentare mit @param usw. damit der Editor hilft.',
  },
  priority: {
    label: 'priority',
    en: 'Stack execution order field: lower numbers run earlier within the transformer chain.',
    de: 'priority => wer zuerst dran ist: kleinere Zahl = früher.',
  },
  getAction: {
    label: 'getAction(input, name)',
    en: 'Reads input.actions[name] with a safe fallback to zero.',
    de: 'getAction => liest eine Zahl aus actions (fehlt → 0).',
  },
  vec: {
    label: 'api.vec',
    en: 'Grouped vector helpers on api (add, scale, dot, length, forward/up from rotation, …).',
    de: 'api.vec => Rechen-Hilfen für [x,y,z]-Listen.',
  },
  visualize: {
    label: 'api.visualize',
    en: 'Builder-only numeric overlay probe (indexed channel) while Visualize mode is active.',
    de: 'visualize => nur Bau-Modus: malt eine Zahl sichtbar.',
  },
  visualizeLine: {
    label: 'api.visualizeLine',
    en: 'Builder-only line visualization between two Vec3 points.',
    de: 'visualizeLine => nur Bau-Modus: Linie zwischen zwei Punkten.',
  },
  clamp: {
    label: 'api.clamp',
    en: 'Numeric inclusive clamp helper.',
    de: 'clamp => Zahl nicht kleiner als min, nicht größer als max.',
  },
  log: {
    label: 'api.log',
    en: 'Play-mode snackbar log line (wired in SceneView).',
    de: 'log => kurze Meldung am Rand im Play-Modus.',
  },
  getWorldPosition: {
    label: 'getWorldPosition',
    en: 'Live world position lookup from physics/renderer cache.',
    de: 'getWorldPosition => frag: wo ist das Ding jetzt?',
  },
  getEntity: {
    label: 'getEntity',
    en: 'Heavier snapshot of persisted entity plus live accessor—avoid on hottest paths.',
    de: 'getEntity => riesiger Infobrocken – nur wenn du wirklich alles brauchst.',
  },
  eval: {
    label: 'eval',
    en: 'Forbidden in custom transformer sources for security; compile step rejects dangerous patterns.',
    de: 'eval => verboten (zu unsicher).',
  },
  JavaScript: {
    label: 'JavaScript',
    en: 'Language used for custom transformer bodies.',
    de: 'JavaScript => die Sprache, in der du schreibst.',
  },
  Entity: {
    label: 'entity',
    en: 'World object instance your transformer is attached to.',
    de: 'entity => dein Objekt in der Welt.',
  },
  Record: {
    label: 'Record<string, number>',
    en: 'TypeScript-style map from string keys to numbers (actions bag).',
    de: 'Record => Liste: Name → Zahl (hier für actions).',
  },
  new_Date: {
    label: 'new Date()',
    en: 'Wall-clock time; does not pause with editor play and is not tied to dt accumulation.',
    de: 'new Date() => echte Uhr (hält nicht an, wenn du Pause drückst).',
  },
} satisfies Record<string, TransformerGlossaryEntry>

export type TransformerDocsGlossaryKey = keyof typeof TRANSFORMER_DOCS_GLOSSARY

/** Rows for glossary chapter: stable sort by English label */
export function getGlossaryEntriesSorted(): { key: TransformerDocsGlossaryKey; entry: TransformerGlossaryEntry }[] {
  const keys = Object.keys(TRANSFORMER_DOCS_GLOSSARY) as TransformerDocsGlossaryKey[]
  return keys
    .map(key => ({ key, entry: TRANSFORMER_DOCS_GLOSSARY[key] }))
    .sort((a, b) => a.entry.label.localeCompare(b.entry.label, 'en', { sensitivity: 'base' }))
}