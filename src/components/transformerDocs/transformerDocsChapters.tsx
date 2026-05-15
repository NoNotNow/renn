import type { CSSProperties, ReactNode } from 'react'

import { theme } from '@/config/theme'
import type { TransformerDocsLocale } from './glossary'
import { getGlossaryEntriesSorted } from './glossary'
import { DocTerm } from './DocTerm'

const subHeaderStyle: CSSProperties = {
  marginTop: 24,
  marginBottom: 12,
  fontSize: 16,
  fontWeight: 600,
  color: theme.text.primary,
}

const codeBlockStyle: CSSProperties = {
  background: '#1e1e1e',
  color: '#d4d4d4',
  padding: '16px',
  borderRadius: '8px',
  overflowX: 'auto',
  fontSize: '13px',
  fontFamily: 'monospace',
  margin: '16px 0',
  border: '1px solid #333',
  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  margin: '16px 0',
  fontSize: '13px',
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px',
  borderBottom: `2px solid ${theme.border.default}`,
  color: theme.text.muted,
  fontWeight: 600,
}

const tdStyle: CSSProperties = {
  padding: '10px',
  borderBottom: `1px solid ${theme.border.default}`,
  verticalAlign: 'top',
}

const CANONICAL_FN = `/**
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
    impulse: [0, 10, 0] // Example: constant upward impulse
  };
}`

const BASIC_MOVE = `function transform(input, dt, params, state, api) {
  const forward = api.vec.getForwardVector(input.rotation);
  const power = api.getAction(input, 'forward') * 100;
  
  return {
    force: api.vec.scale(forward, power)
  };
}`

const SYNTHETIC_FN = `function transform(input, dt, params, state, api) {
  state.t = (state.t ?? 0) + dt;

  // Car-style names (must match your input / car preset mapping)
  if (state.t > 1 && state.t < 4) input.actions.throttle = 0.35;
  if (input.position[0] > 8) input.actions.steer_right = 1;
  else if (input.position[0] < -8) input.actions.steer_left = 1;

  return {};
}`

const VIZ_FN = `function transform(input, dt, params, state, api) {
  const speed = api.vec.length(input.velocity);
  api.visualize(speed, '#00ff00', 'Speed', 1);
  
  const target = [0, 5, 0];
  api.visualizeCoordinate(target, 'red');
  
  return {};
}`

export interface TransformerDocChapter {
  id: string
  title: string
  content: ReactNode
  keywords: string[]
  plainText?: string
}

export function transformerDocsChrome(locale: TransformerDocsLocale) {
  if (locale === 'de')
    return {
      modalTitle: 'Hilfe: Transformer-Code',
      searchPlaceholder: 'Such was…',
      noResults: (q: string) => `Nix gefunden zu „${q}".`,
      languageLabel: 'Sprache',
      glossaryNote:
        'Links stehen die englischen Wörter – so heißen sie im Code. Rechts steht einfach erklärt, was sie meinen. Mit der Maus über unterstrichene Wörter im Text: kurze Erinnerung (Tooltip).',
      glossaryColTerm: 'Codewort',
      glossaryColExplanation: 'Heißt bei dir',
    }
  return {
    modalTitle: 'Transformer coding documentation',
    searchPlaceholder: 'Search documentation…',
    noResults: (q: string) => `No results found for "${q}"`,
    languageLabel: 'Language:',
    glossaryNote:
      'The first column uses English identifiers exactly as in code. Hover terms in prose for a short tooltip; this table repeats the full glossary.',
    glossaryColTerm: 'Term (code / API)',
    glossaryColExplanation: 'Explanation',
  }
}

type ChapterId =
  | 'intro'
  | 'glossary'
  | 'api-input'
  | 'api-output'
  | 'api-runtime'
  | 'recipes'
  | 'troubleshooting'

function chapterTitles(locale: TransformerDocsLocale): Record<ChapterId, string> {
  if (locale === 'de')
    return {
      intro: 'So geht das',
      glossary: 'Wörterbuch',
      'api-input': 'Was reinkommt (TransformInput)',
      'api-output': 'Was rauskommt (TransformOutput)',
      'api-runtime': 'Helfer-Werkzeug (TransformerRuntimeApi)',
      recipes: 'Mini-Beispiele',
      troubleshooting: 'Wenn was schiefgeht',
    }
  return {
    intro: 'Introduction',
    glossary: 'Glossary',
    'api-input': 'API: TransformInput',
    'api-output': 'API: TransformOutput',
    'api-runtime': 'API: TransformerRuntimeApi',
    recipes: 'Recipes & Examples',
    troubleshooting: 'Troubleshooting',
  }
}

function glossaryChapter(locale: TransformerDocsLocale) {
  const chrome = transformerDocsChrome(locale)
  const rows = getGlossaryEntriesSorted()
  const expl = locale === 'de' ? 'de' : 'en'

  let plainPieces = chrome.glossaryNote
  for (const { entry } of rows) plainPieces += ` ${entry.label} ${expl === 'de' ? entry.de : entry.en}`

  return {
    plainText: plainPieces,
    keywords: ['glossary', 'glossar', 'dictionary', 'begriffe', 'tooltip', ...rows.map(({ entry }) => entry.label)],
    content: (
      <div lang={locale === 'de' ? 'de' : 'en'}>
        <p style={{ marginBottom: 16 }}>{chrome.glossaryNote}</p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>{chrome.glossaryColTerm}</th>
              <th style={thStyle}>{chrome.glossaryColExplanation}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, entry }) => (
              <tr key={key}>
                <td style={{ ...tdStyle, fontFamily: 'ui-monospace, monospace', whiteSpace: 'nowrap' }}>
                  <abbr title={expl === 'de' ? entry.de : entry.en} style={{ cursor: 'help' }}>
                    {entry.label}
                  </abbr>
                </td>
                <td style={tdStyle}>{expl === 'de' ? entry.de : entry.en}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  }
}

export function buildTransformerDocsChapters(locale: TransformerDocsLocale): TransformerDocChapter[] {
  const ct = chapterTitles(locale)

  if (locale === 'en')
    return [
      {
        id: 'intro',
        title: ct.intro,
        keywords: ['intro', 'transformer', 'custom', 'code', 'basics', 'monaco', 'intellisense'],
        plainText:
          `Custom transformers allow you to write JavaScript code that runs every frame to control an entity physics behavior. Canonical Format transform function Monaco IntelliSense JSDoc.`,
        content: (
          <div lang="en">
            <p>
              Custom transformers let you author <DocTerm term="JavaScript"><code>JavaScript</code></DocTerm> that runs
              each physics tick to steer an <DocTerm term="Entity"><code>entity</code></DocTerm>’s dynamics—movement
              patterns, vehicles, or interactive rigs.
            </p>
            <h3 style={subHeaderStyle}>Canonical format</h3>
            <p>
              Define a <DocTerm term="transform"><code>transform</code></DocTerm> function with the usual{' '}
              <DocTerm term="TransformInput"><code>TransformInput</code></DocTerm>, <DocTerm term="dt"><code>dt</code></DocTerm>,{' '}
              <DocTerm term="params"><code>params</code></DocTerm>, <DocTerm term="state"><code>state</code></DocTerm>,{' '}
              <DocTerm term="TransformerRuntimeApi"><code>TransformerRuntimeApi</code></DocTerm> parameters and{' '}
              <DocTerm term="TransformOutput"><code>TransformOutput</code></DocTerm> return type:
            </p>
            <pre style={codeBlockStyle}>{CANONICAL_FN}</pre>
            <p>
              <DocTerm term="JSDoc">JSDoc</DocTerm> boosts <DocTerm term="Monaco">Monaco</DocTerm>{' '}
              <DocTerm term="IntelliSense">IntelliSense</DocTerm> for <DocTerm term="input_object"><code>input</code></DocTerm> and{' '}
              <DocTerm term="api"><code>api</code></DocTerm>.
            </p>
          </div>
        ),
      },
      {
        id: 'api-input',
        title: ct['api-input'],
        keywords: ['input', 'velocity', 'rotation', 'actions', 'keys', 'environment'],
        plainText:
          'TransformInput entity state actions mapped keyboard Record position metres rotation euler radians velocity angularVelocity environment EnvironmentState isGrounded groundNormal isTouchingObject',
        content: (
          <div lang="en">
            <p>
              The <DocTerm term="input_object"><code>input</code></DocTerm> snapshot combines pose, motion, contacts, and{' '}
              <DocTerm term="actions"><code>actions</code></DocTerm>.
            </p>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Field</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="actions">
                      <code>actions</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="Record">
                      <code>Record&lt;string, number&gt;</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>Mapped keyboard / wheel semantic axes (typically 0–1 or −1–1).</td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="position">
                      <code>position</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="Vec3">
                      <code>Vec3</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    World position <code>[x, y, z]</code> in metres.
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="rotation">
                      <code>rotation</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="rotation">
                      <code>Rotation</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    Euler <code>[x, y, z]</code> in radians.
                  </td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="velocity">
                      <code>velocity</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="Vec3">
                      <code>Vec3</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>World linear velocity (m/s).</td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="angularVelocity">
                      <code>angularVelocity</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="Vec3">
                      <code>Vec3</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>World angular velocity (rad/s).</td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="environment">
                      <code>environment</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="EnvironmentState">
                      <code>EnvironmentState</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>Contacts, grounding, normals, supporting surfaces.</td>
                </tr>
              </tbody>
            </table>
            <h4 style={subHeaderStyle}>EnvironmentState</h4>
            <ul>
              <li>
                <DocTerm term="isGrounded">
                  <code>isGrounded</code>
                </DocTerm>{' '}
                — grounded on counted ground filters.
              </li>
              <li>
                <DocTerm term="groundNormal">
                  <code>groundNormal</code>
                </DocTerm>{' '}
                — approximate contact normal under the entity.
              </li>
              <li>
                <DocTerm term="isTouchingObject">
                  <code>isTouchingObject</code>
                </DocTerm>{' '}
                — overlaps any other collider.
              </li>
            </ul>
          </div>
        ),
      },
      {
        id: 'glossary',
        title: ct.glossary,
        ...glossaryChapter(locale),
      },
      {
        id: 'api-output',
        title: ct['api-output'],
        keywords: ['output', 'impulse', 'torque', 'velocity', 'position', 'rotation', 'color'],
        plainText:
          'TransformOutput force impulse torque linvel addRotation color transform return physics euler mesh rgb',
        content: (
          <div lang="en">
            <p>
              <DocTerm term="transform">
                <code>transform</code>
              </DocTerm>{' '}
              usually returns physics deltas as <DocTerm term="TransformOutput"><code>TransformOutput</code></DocTerm>:
            </p>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Field</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="force">
                      <code>force</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="Vec3">
                      <code>Vec3</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>Continuous force applied this integration step (N).</td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="impulse">
                      <code>impulse</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="Vec3">
                      <code>Vec3</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>Instantaneous impulse (N·s).</td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="torque">
                      <code>torque</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="Vec3">
                      <code>Vec3</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>Torque persisted for the solver step.</td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="linvel">
                      <code>linvel</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="Vec3">
                      <code>Vec3</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>Overwrite linear velocity (use sparingly).</td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="addRotation">
                      <code>addRotation</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="rotation">
                      <code>Rotation</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>Euler delta added after stepping (rad).</td>
                </tr>
                <tr>
                  <td style={tdStyle}>
                    <DocTerm term="color">
                      <code>color</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>
                    <DocTerm term="Vec3">
                      <code>Vec3</code>
                    </DocTerm>
                  </td>
                  <td style={tdStyle}>Optional RGB tint 0–1 for feedback meshes.</td>
                </tr>
              </tbody>
            </table>
          </div>
        ),
      },
      {
        id: 'api-runtime',
        title: ct['api-runtime'],
        keywords: ['api', 'vec', 'math', 'log', 'visualize', 'world', 'position', 'clamp'],
        plainText:
          'TransformerRuntimeApi api.vec add scale length dot getForwardVector getUpVector getForwardSpeed getAction clamp log visualize visualizeCoordinate getWorldPosition getEntity snackbar overlay',
        content: (
          <div lang="en">
            <p>
              Helpers live on frozen <DocTerm term="TransformerRuntimeApi"><code>TransformerRuntimeApi</code></DocTerm> (
              alias <DocTerm term="api"><code>api</code></DocTerm>). Vector tuple math is grouped under{' '}
              <DocTerm term="vec">
                <code>api.vec.*</code>
              </DocTerm>
              .
            </p>
            <h4 style={subHeaderStyle}>
              Vector math (<DocTerm term="vec"><code>api.vec</code></DocTerm>)
            </h4>
            <ul>
              <li>
                <code>api.vec.add(a, b)</code> — component-wise sum.
              </li>
              <li>
                <code>api.vec.scale(v, s)</code> — scale tuple by scalar.
              </li>
              <li>
                <code>api.vec.length(v)</code> — Euclidean length.
              </li>
              <li>
                <code>api.vec.dot(a, b)</code> — dot product.
              </li>
              <li>
                <code>api.vec.getForwardVector(rotation)</code> — forward basis (−Z facing).
              </li>
              <li>
                <code>api.vec.getUpVector(rotation)</code> — up (+Y).
              </li>
              <li>
                <code>api.vec.getForwardSpeed(velocity, forward)</code> — signed longitudinal speed along{' '}
                <code>forward</code>.
              </li>
            </ul>
            <h4 style={subHeaderStyle}>Utilities</h4>
            <ul>
              <li>
                <DocTerm term="getAction">
                  <code>api.getAction(input, name)</code>
                </DocTerm>{' '}
                — wraps <DocTerm term="actions"><code>actions</code></DocTerm> lookup.
              </li>
              <li>
                <DocTerm term="clamp">
                  <code>api.clamp(value, min, max)</code>
                </DocTerm>
              </li>
              <li>
                <DocTerm term="log">
                  <code>api.log(message, durationSeconds?)</code>
                </DocTerm>{' '}
                → play snackbar.
              </li>
              <li>
                <DocTerm term="visualize">
                  <code>api.visualize(...)</code>
                </DocTerm>{' '}
                — Builder variable overlay probes.
              </li>
              <li>
                <DocTerm term="visualizeCoordinate">
                  <code>api.visualizeCoordinate(pos, color)</code>
                </DocTerm>{' '}
                — ruler toward <DocTerm term="Vec3"><code>Vec3</code></DocTerm>.
              </li>
              <li>
                <DocTerm term="getWorldPosition">
                  <code>api.getWorldPosition(id)</code>
                </DocTerm>
              </li>
              <li>
                <DocTerm term="getEntity">
                  <code>api.getEntity(id)</code>
                </DocTerm>
              </li>
            </ul>
          </div>
        ),
      },
      {
        id: 'recipes',
        title: ct.recipes,
        keywords: ['example', 'recipe', 'jump', 'hover', 'movement', 'visualize', 'actions', 'throttle', 'steer', 'car2', 'synthetic'],
        plainText: `${BASIC_MOVE} ${SYNTHETIC_FN} ${VIZ_FN} throttle steer car2 visualize`,
        content: (
          <div lang="en">
            <h4 style={subHeaderStyle}>Basic movement</h4>
            <pre style={codeBlockStyle}>{BASIC_MOVE}</pre>
            <h4 style={subHeaderStyle}>
              Synthetic <DocTerm term="actions"><code>actions</code></DocTerm> feeding <DocTerm term="car2"><code>car2</code></DocTerm> / movers
            </h4>
            <p style={{ marginBottom: 12 }}>
              Same choreography as the{' '}
              <DocTerm term="input_preset">
                <code>input</code>
              </DocTerm>{' '}
              preset: mutate{' '}
              <DocTerm term="actions"><code>input.actions</code></DocTerm>, then{' '}
              <code>return {'{}'}</code>. Queue this <DocTerm term="custom_transformer">custom</DocTerm>{' '}
              <DocTerm term="transform">
                <code>transform</code>
              </DocTerm>{' '}
              <strong>after</strong> hardware{' '}
              <DocTerm term="input_preset">
                <code>input</code>
              </DocTerm>{' '}
              and <strong>before</strong> <DocTerm term="car2"><code>car2</code></DocTerm> so{' '}
              <DocTerm term="priority"><code>priority</code></DocTerm> order stays ascending (lower runs first).
              Accumulate timers with <DocTerm term="state"><code>state</code></DocTerm> +
              <DocTerm term="dt"><code>dt</code></DocTerm>;{' '}
              <DocTerm term="new_Date">
                <code>new Date()</code>
              </DocTerm>{' '}
              stays wall-clock only.
            </p>
            <pre style={codeBlockStyle}>{SYNTHETIC_FN}</pre>
            <h4 style={subHeaderStyle}>Visual debugging</h4>
            <pre style={codeBlockStyle}>{VIZ_FN}</pre>
          </div>
        ),
      },
      {
        id: 'troubleshooting',
        title: ct.troubleshooting,
        keywords: ['error', 'compile', 'runtime', 'debug', 'performance', 'eval', 'sandbox'],
        plainText:
          'Compile errors forbidden eval runtime amber stacktrace state recreated performance transformer hot path getWorldPosition preferred',
        content: (
          <div lang="en">
            <ul>
              <li>
                <strong>Compile errors:</strong> syntax/forbidden helpers like <DocTerm term="eval"><code>eval</code></DocTerm> surface under the Monaco surface.
              </li>
              <li>
                <strong>Runtime errors:</strong>{' '}
                <DocTerm term="transform">
                  <code>transform()</code>
                </DocTerm>{' '}
                exceptions show amber panels plus stack snippets.
              </li>
              <li>
                <strong>
                  <DocTerm term="state">
                    <code>state</code>
                  </DocTerm>{' '}
                  lifetime:
                </strong>{' '}
                persists between ticks until configs reload—clear expectations when iterating.
              </li>
              <li>
                <strong>Perf:</strong> avoid heavy{' '}
                <DocTerm term="getEntity">
                  <code>getEntity</code>
                </DocTerm>{' '}
                bursts; favour <DocTerm term="getWorldPosition"><code>getWorldPosition</code></DocTerm>.
              </li>
            </ul>
          </div>
        ),
      },
    ]

  // --------- German ---------
  return [
    {
      id: 'intro',
      title: ct.intro,
      keywords: ['einführung', 'intro', 'transformer', 'custom', 'code', 'basics', 'monaco', 'intellisense', 'hilfe'],
      plainText:
        'Transformer custom JavaScript entity Monaco Hilfe TransformInput TransformOutput eingabe ausgabe',
      content: (
        <div lang="de">
          <p>
            Hier programmierst du deinen eigenen Transformer (Typ <DocTerm term="custom_transformer"><code>custom</code></DocTerm>). Er läuft
            immer wieder sehr schnell mit und lenkt deine <DocTerm term="Entity"><code>entity</code></DocTerm> (dein Objekt in der Welt) – z.B. wie sie sich bewegt.
          </p>
          <h3 style={subHeaderStyle}>Dein erster Bauplan</h3>
          <p>
            Du baust eine Funktion <DocTerm term="transform"><code>transform</code></DocTerm>. Dahin kommt{' '}
            <DocTerm term="TransformInput"><code>TransformInput</code></DocTerm> mit{' '}
            <DocTerm term="input_object"><code>input</code></DocTerm> (<strong>was reinkommt</strong>), dann{' '}
            <DocTerm term="dt"><code>dt</code></DocTerm>, <DocTerm term="params"><code>params</code></DocTerm>,{' '}
            <DocTerm term="state"><code>state</code></DocTerm>,{' '}
            <DocTerm term="TransformerRuntimeApi"><code>TransformerRuntimeApi</code></DocTerm>{' '}
            <DocTerm term="api"><code>api</code></DocTerm> (dein Helfer-Kasten). Zurück
            kommt <DocTerm term="TransformOutput"><code>TransformOutput</code></DocTerm> (<strong>was rauskommt</strong> –
            Schub, Stoß, … oder leer <code>{'{}'}</code>):
          </p>
          <pre lang="en" style={codeBlockStyle}>
            {CANONICAL_FN}
          </pre>
          <p>
            Kommentare mit <DocTerm term="JSDoc">JSDoc</DocTerm> helfen:{' '}
            <DocTerm term="Monaco">Monaco</DocTerm> zeigt dir was mit <DocTerm term="IntelliSense">IntelliSense</DocTerm>.
            Die Wörter im Code bleiben Englisch – so kannst du alles gut von der Hilfe kopieren.
          </p>
        </div>
      ),
    },
    {
      id: 'api-input',
      title: ct['api-input'],
      keywords: ['eingabe', 'input', 'velocity', 'rotation', 'actions', 'environment', 'boden'],
      plainText:
        'input TransformInput wo steht geschwindigkeit drehen actions tastatur boden deutsch',
      content: (
        <div lang="de">
          <p>
            <DocTerm term="input_object"><code>input</code></DocTerm> ist ein Sack mit Infos: Wo? Wie schnell? Tasten?
            Alles Wichtige für <DocTerm term="actions"><code>actions</code></DocTerm> landet auch da.
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name im Code</th>
                <th style={thStyle}>Sorte</th>
                <th style={thStyle}>Einfach gesagt</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="actions"><code>actions</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="Record"><code>Record&lt;string, number&gt;</code></DocTerm>
                </td>
                <td style={tdStyle}>Tasten und Räder werden zu Zahlen (meist 0…1 oder −1…1).</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="position"><code>position</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="Vec3"><code>Vec3</code></DocTerm>
                </td>
                <td style={tdStyle}>Ort in der Welt [x, y, z] in Metern.</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="rotation"><code>rotation</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <code>Rotation</code>
                </td>
                <td style={tdStyle}>Kippen und Drehen als Winkel [x, y, z] (Radiant – so will der Code).</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="velocity"><code>velocity</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="Vec3"><code>Vec3</code></DocTerm>
                </td>
                <td style={tdStyle}>Wie schnell es sich gerade bewegt (m/s).</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="angularVelocity"><code>angularVelocity</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="Vec3"><code>Vec3</code></DocTerm>
                </td>
                <td style={tdStyle}>Wie schnell es sich dreht.</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="environment"><code>environment</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="EnvironmentState"><code>EnvironmentState</code></DocTerm>
                </td>
                <td style={tdStyle}>Boden ja/nein, irgendwas berührt? Kurzinfos dazu.</td>
              </tr>
            </tbody>
          </table>
          <h4 lang="en" style={subHeaderStyle}>
            EnvironmentState
          </h4>
          <ul>
            <li>
              <span lang="en">
                <DocTerm term="isGrounded">
                  <code>isGrounded</code>
                </DocTerm>
              </span>
              {' '}
              – steht gerade stabil auf dem Boden?
            </li>
            <li>
              <span lang="en">
                <DocTerm term="groundNormal">
                  <code>groundNormal</code>
                </DocTerm>
              </span>
              {' '}
              – welche Seite vom Boden ist „hoch“ zum Stehen.
            </li>
            <li>
              <span lang="en">
                <DocTerm term="isTouchingObject">
                  <code>isTouchingObject</code>
                </DocTerm>
              </span>
              {' '}
              – klebt irgendwo?
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'glossary',
      title: ct.glossary,
      ...glossaryChapter(locale),
    },
    {
      id: 'api-output',
      title: ct['api-output'],
      keywords: ['ausgabe', 'impulse', 'torque', 'linvel'],
      plainText:
        'TransformOutput ausgabe kraft stoss drehen geschwindigkeit farbe deutsch',
      content: (
        <div lang="de">
          <p>
            Wenn <DocTerm term="transform"><code>transform</code></DocTerm> fertig ist, gibst du ein Objekt vom Typ{' '}
            <DocTerm term="TransformOutput"><code>TransformOutput</code></DocTerm> zurück – also <strong>was rauskommt</strong>{' '}
            für die Physik. Die Namen drin bleiben Englisch:
          </p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Name im Code</th>
                <th style={thStyle}>Sorte</th>
                <th style={thStyle}>Einfach gesagt</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="force"><code>force</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="Vec3"><code>Vec3</code></DocTerm>
                </td>
                <td style={tdStyle}>Sanft drücken / ziehen (hält an wie ein Motor).</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="impulse"><code>impulse</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="Vec3"><code>Vec3</code></DocTerm>
                </td>
                <td style={tdStyle}>Ein kurzer, harter Stups.</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="torque"><code>torque</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="Vec3"><code>Vec3</code></DocTerm>
                </td>
                <td style={tdStyle}>Drehen antreiben.</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="linvel"><code>linvel</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="Vec3"><code>Vec3</code></DocTerm>
                </td>
                <td style={tdStyle}>Bewegungs-Speed brutal überschreiben (nur wenn du weißt, warum).</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="addRotation"><code>addRotation</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <code>Rotation</code>
                </td>
                <td style={tdStyle}>Noch ein Stück zusätzlich drehen.</td>
              </tr>
              <tr>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="color"><code>color</code></DocTerm>
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                  <DocTerm term="Vec3"><code>Vec3</code></DocTerm>
                </td>
                <td style={tdStyle}>Farbe ändern zum Anzeigen (0–1 pro Kanal).</td>
              </tr>
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: 'api-runtime',
      title: ct['api-runtime'],
      keywords: ['hilfsfunktion', 'visualize', 'vec', 'log'],
      plainText:
        'api Helfer rechner vec deutsch getAction visualize',
      content: (
        <div lang="de">
          <p>
            <DocTerm term="api"><code>api</code></DocTerm> ist die Kurzform von{' '}
            <DocTerm term="TransformerRuntimeApi"><code>TransformerRuntimeApi</code></DocTerm> – ein Kasten mit
            Fertig-Funktionen (Rechnen, Fragen, Anzeigen). Viele Helfer für{' '}
            <DocTerm term="Vec3"><code>Vec3</code></DocTerm>-Listen ([x,y,z]-Pfeile) liegen unter{' '}
            <DocTerm term="vec"><code>api.vec.*</code></DocTerm>.
          </p>
          <h4 style={subHeaderStyle} lang="en">
            Vector math (<code>api.vec</code>)
          </h4>
          <ul>
            <li style={{ marginBottom: 6 }}>
              <code lang="en">api.vec.add(a, b)</code> – zwei Listen addieren (x zu x, y zu y …).
            </li>
            <li style={{ marginBottom: 6 }}>
              <code lang="en">api.vec.scale(v, s)</code> – alle drei Zahlen mit derselben Zahl malnehmen.
            </li>
            <li style={{ marginBottom: 6 }}>
              <code lang="en">api.vec.length(v)</code> – wie „lang“ der Pfeil ist.
            </li>
            <li style={{ marginBottom: 6 }}>
              <code lang="en">api.vec.dot(a, b)</code> – eine Maßzahl wie zwei Pfeile zusammenpassen.
            </li>
            <li style={{ marginBottom: 6 }}>
              <code lang="en">api.vec.getForwardVector(rotation)</code> – Pfeil „nach vorn“ aus der Drehung (Spiel benutzt −Z
              wie Three.js).
            </li>
            <li style={{ marginBottom: 6 }}>
              <code lang="en">api.vec.getUpVector(rotation)</code> – Pfeil „nach oben“ (+Y Welt).
            </li>
            <li style={{ marginBottom: 6 }}>
              <code lang="en">api.vec.getForwardSpeed(velocity, forward)</code> – wie schnell entlang eines Richtungs-Pfeils (
              plus = vorwärts, minus = zurück).
            </li>
          </ul>
          <h4 style={subHeaderStyle}>Noch mehr Knöpfe</h4>
          <ul>
            <li style={{ marginBottom: 8 }}>
              <DocTerm term="getAction"><code lang="en">api.getAction(input, name)</code></DocTerm> – hol dir eine Steuerzahl
              aus <DocTerm term="actions"><code>actions</code></DocTerm>; fehlt → 0.
            </li>
            <li style={{ marginBottom: 8 }}>
              <DocTerm term="clamp"><code lang="en">api.clamp(value, min, max)</code></DocTerm> – Zahl in einen Bereich klemmen.
            </li>
            <li style={{ marginBottom: 8 }}>
              <DocTerm term="log"><code lang="en">api.log(message, durationSeconds?)</code></DocTerm> – kleiner Text am Rand
              im Play-Modus.
            </li>
            <li style={{ marginBottom: 8 }}>
              <DocTerm term="visualize"><code lang="en">api.visualize(...)</code></DocTerm> – nur zum Bauen: Zahl sichtbar
              machen.
            </li>
            <li style={{ marginBottom: 8 }}>
              <DocTerm term="visualizeCoordinate"><code lang="en">api.visualizeCoordinate(pos, color)</code></DocTerm> – nur
              zum Bauen: Linie zu einem Punkt.
            </li>
            <li style={{ marginBottom: 8 }}>
              <DocTerm term="getWorldPosition"><code lang="en">api.getWorldPosition(id)</code></DocTerm> – wo ist eine andere{' '}
              <DocTerm term="Entity"><code>entity</code></DocTerm> (ein anderes Objekt) gerade?
            </li>
            <li style={{ marginBottom: 8 }}>
              <DocTerm term="getEntity"><code lang="en">api.getEntity(id)</code></DocTerm> – viele Infos über eine{' '}
              <DocTerm term="Entity"><code>entity</code></DocTerm> auf einmal; nur wenn nötig, sonst langsam.
            </li>
          </ul>
        </div>
      ),
    },
    {
      id: 'recipes',
      title: ct.recipes,
      keywords: ['beispiele', 'rezept', 'throttle', 'car2', 'actions'],
      plainText:
        `${BASIC_MOVE} deutsch synthetic throttle steer input.actions car2 empty return prioritize`,
      content: (
        <div lang="de">
          <h4 style={subHeaderStyle}>Einfach vorwärts schieben</h4>
          <pre lang="en" style={codeBlockStyle}>
            {BASIC_MOVE}
          </pre>
          <p style={{ fontSize: 13, marginTop: -8 }}>
            Das Wort <DocTerm term="forward_action"><code>&apos;forward&apos;</code></DocTerm> muss bei dir genau so heißen
            wie in deinem <DocTerm term="input_preset"><code>input</code></DocTerm>-Preset eingetragen.
          </p>
          <h4 style={subHeaderStyle}>
            Auto steuern ohne Tasten (<DocTerm term="actions"><code>actions</code></DocTerm> für{' '}
            <DocTerm term="car2"><code>car2</code></DocTerm>)
          </h4>
          <p style={{ marginBottom: 12 }}>
            Wie beim normalen <DocTerm term="input_preset"><code>input</code></DocTerm>-Preset: du schreibst Zahlen in{' '}
            <DocTerm term="actions"><code>input.actions</code></DocTerm>, z.B. <DocTerm term="throttle"><code>throttle</code></DocTerm>,{' '}
            <DocTerm term="steer_left"><code>steer_left</code></DocTerm>,{' '}
            <DocTerm term="steer_right"><code>steer_right</code></DocTerm>. Dann <code>return {'{}'}</code> (leere Ausgabe). Dein
            eigener <DocTerm term="custom_transformer"><code>custom</code></DocTerm>-Transformer kommt <strong>nach</strong> dem
            Tastatur-<DocTerm term="input_preset"><code>input</code></DocTerm> und <strong>vor</strong>{' '}
            <DocTerm term="car2"><code>car2</code></DocTerm>. <DocTerm term="priority"><code>priority</code></DocTerm>-Tipp:
            kleinere Zahl = läuft früher. Für Zeiten nimm <DocTerm term="state"><code>state</code></DocTerm> +{' '}
            <DocTerm term="dt"><code>dt</code></DocTerm> (Spiel-Takt), nicht <DocTerm term="new_Date"><code>new Date()</code></DocTerm>{' '}
            (echte Uhr – lässt sich nicht pausieren).
          </p>
          <pre lang="en" style={codeBlockStyle}>
            {SYNTHETIC_FN}
          </pre>
          <h4 style={subHeaderStyle}>Zeichnen zum Gucken</h4>
          <pre lang="en" style={codeBlockStyle}>
            {VIZ_FN}
          </pre>
          <p style={{ fontSize: 12, color: theme.text.muted }}>
            <DocTerm term="visualize"><code>api.visualize*</code></DocTerm> geht nur beim Bauen, wenn Visualize an ist.
          </p>
        </div>
      ),
    },
    {
      id: 'troubleshooting',
      title: ct.troubleshooting,
      keywords: ['fehler', 'compile', 'runtime', 'eval', 'state'],
      plainText:
        'Kompilierfehler Sandbox eval Laufzeitfehler amber state Performance getEntity deutsch',
      content: (
        <div lang="de">
          <ul>
            <li>
              <strong>Roter Text unter dem Code:</strong> Tippfehler oder verbotene Sachen wie{' '}
              <DocTerm term="eval"><code>eval</code></DocTerm> – weg damit.
            </li>
            <li>
              <strong>Gelbes Fenster beim Spielen:</strong> In <DocTerm term="transform"><code>transform()</code></DocTerm> ist
              was kaputt gegangen – da steht meistens was Schlimmes in der Liste.
            </li>
            <li>
              <strong>
                <DocTerm term="state">
                  <code>state</code>
                </DocTerm>{' '}
                merkt sich:
              </strong>{' '}
              bleibt, bis du die Welt oder den <DocTerm term="custom_transformer"><code>custom</code></DocTerm>-Transformer
              neu lädst – wie ein kleines Notizbuch.
            </li>
            <li>
              <strong>Schneller bleiben:</strong> Lieber <DocTerm term="getWorldPosition"><code>getWorldPosition</code></DocTerm>{' '}
              als dauernd <DocTerm term="getEntity"><code>getEntity</code></DocTerm>.
            </li>
          </ul>
        </div>
      ),
    },
  ]
}
