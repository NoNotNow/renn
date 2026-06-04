import type { CSSProperties, ReactNode } from 'react'

import { theme } from '@/config/theme'
import type { TransformerDocsLocale } from './glossary'
import { getGlossaryEntriesSorted } from './glossary'
import { DocTerm } from './DocTerm'
import { ApiDocEntryList } from './ApiDocEntryList'
import {
  API_REFERENCE_SECTIONS,
  API_VEC_SECTION,
  ENVIRONMENT_STATE_ROWS,
  TRANSFORM_FUNCTION_INTRO,
  TRANSFORM_FUNCTION_SIGNATURE,
  TRANSFORM_TARGET_ROWS,
  apiReferencePlainText,
  type ApiDocSection,
} from './transformerApiReference'
import { TRANSFORM_FUNCTION_PARAMS } from './apiParamDocs'
import { DocCodeSample } from './DocCodeSample'
import { attachApiExample } from './transformerApiExamples'

const subHeaderStyle: CSSProperties = {
  marginTop: 24,
  marginBottom: 12,
  fontSize: 16,
  fontWeight: 600,
  color: theme.text.primary,
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

const monoTd: CSSProperties = {
  ...tdStyle,
  fontFamily: 'ui-monospace, monospace',
  whiteSpace: 'nowrap',
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
    impulse: [0, 10, 0],
  };
}`

const BASIC_MOVE = `function transform(input, dt, params, state, api) {
  const forward = api.vec.getForwardVector(input.rotation);
  const power = api.getAction(input, 'forward') * 100;

  return {
    force: api.vec.scale(forward, power),
  };
}`

const SYNTHETIC_FN = `function transform(input, dt, params, state, api) {
  state.t = (state.t ?? 0) + dt;

  if (state.t > 1 && state.t < 4) input.actions.throttle = 0.35;
  if (input.position[0] > 8) input.actions.steer_right = 1;
  else if (input.position[0] < -8) input.actions.steer_left = 1;

  return {};
}`

const RAYCAST_FN = `function transform(input, dt, params, state, api) {
  const forward = api.getForwardVector(input.rotation);
  const front = api.vec.offsetAlong(input.position, forward, 5);
  const hit = api.raycastSpread(front, forward, 20, 2, 5, { visualize: true });

  if (hit.hit && hit.distance < 3) {
    return { force: api.vec.scale(forward, -150) };
  }
  return {};
}`

const VIZ_FN = `function transform(input, dt, params, state, api) {
  const speed = api.vec.length(input.velocity);
  api.visualize(speed, '#00ff00', 'Speed', 1);
  api.visualizeLine(input.position, [0, 5, 0], 'red');
  return {};
}`

export interface TransformerDocChapter {
  id: string
  title: string
  content: ReactNode
  keywords: string[]
  plainText?: string
}

function t(locale: TransformerDocsLocale, en: string, de: string): string {
  return locale === 'de' ? de : en
}

export function transformerDocsChrome(locale: TransformerDocsLocale) {
  if (locale === 'de')
    return {
      modalTitle: 'Transformer-Code — Dokumentation',
      searchPlaceholder: 'Dokumentation durchsuchen…',
      noResults: (q: string) => `Keine Treffer für „${q}".`,
      languageLabel: 'Sprache',
      glossaryNote:
        'Links stehen die englischen Begriffe aus dem Code. Rechts die Erklärung auf Deutsch. Unterstrichene Wörter im Text zeigen beim Darüberfahren einen kurzen Hinweis.',
      glossaryColTerm: 'Begriff im Code',
      glossaryColExplanation: 'Erklärung',
    }
  return {
    modalTitle: 'Custom transformer documentation',
    searchPlaceholder: 'Search documentation…',
    noResults: (q: string) => `No results for "${q}".`,
    languageLabel: 'Language',
    glossaryNote:
      'The first column lists English identifiers exactly as in code. Hover underlined terms in the text for tooltips; this table repeats the full glossary.',
    glossaryColTerm: 'Term (code / API)',
    glossaryColExplanation: 'Explanation',
  }
}

type ChapterId = 'intro' | 'glossary' | 'api-reference' | 'recipes' | 'troubleshooting'

function chapterTitles(locale: TransformerDocsLocale): Record<ChapterId, string> {
  if (locale === 'de')
    return {
      intro: 'Überblick',
      glossary: 'Glossar',
      'api-reference': 'API-Referenz',
      recipes: 'Beispiele',
      troubleshooting: 'Fehler beheben',
    }
  return {
    intro: 'Overview',
    glossary: 'Glossary',
    'api-reference': 'API reference',
    recipes: 'Examples',
    troubleshooting: 'Troubleshooting',
  }
}

function renderApiSection(locale: TransformerDocsLocale, section: ApiDocSection) {
  const isMethodSection = section.id === 'api-vec' || section.id === 'api-runtime'
  return (
    <div key={section.id}>
      <h4 style={subHeaderStyle}>{t(locale, section.titleEn, section.titleDe)}</h4>
      {section.introEn && (
        <p style={{ marginBottom: 12 }}>{t(locale, section.introEn, section.introDe ?? section.introEn)}</p>
      )}
      <ApiDocEntryList
        locale={locale}
        rows={section.rows}
        paramsLabelEn={isMethodSection ? 'Parameters' : 'Details'}
        paramsLabelDe={isMethodSection ? 'Parameter' : 'Felder'}
      />
    </div>
  )
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
                <td style={monoTd}>
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

function apiReferenceChapter(locale: TransformerDocsLocale) {
  const de = locale === 'de'

  return {
    plainText: apiReferencePlainText(locale),
    keywords: [
      'api',
      'vec',
      'TransformInput',
      'TransformOutput',
      'raycast',
      'raycastSpread',
      'getAction',
      'offsetAlong',
      'angleBetween',
      'signedAngleAroundAxis',
      'projectOntoPlane',
      'getWorldPosition',
      'getStartPosition',
      'environment',
      'target',
      'signature',
      'referenz',
      'reference',
      'parameter',
    ],
    content: (
      <div lang={de ? 'de' : 'en'}>
        <p>{t(locale, TRANSFORM_FUNCTION_INTRO.en, TRANSFORM_FUNCTION_INTRO.de)}</p>

        <ApiDocEntryList
          locale={locale}
          rows={[
            attachApiExample({
              name: 'transform',
              signature: TRANSFORM_FUNCTION_SIGNATURE,
              callName: 'transform',
              type: 'TransformOutput | undefined',
              params: TRANSFORM_FUNCTION_PARAMS,
              en: 'Entry point called every physics step.',
              de: 'Wird in jedem Simulationsschritt einmal aufgerufen.',
            }),
          ]}
        />

        {API_REFERENCE_SECTIONS.map(section => renderApiSection(locale, section))}

        <h4 style={subHeaderStyle}>EnvironmentState (`input.environment`)</h4>
        <ApiDocEntryList locale={locale} rows={ENVIRONMENT_STATE_ROWS} />

        <h4 style={subHeaderStyle}>TransformTarget (`input.target`)</h4>
        <p style={{ marginBottom: 12 }}>
          {t(
            locale,
            'Set by targetPoseInput, follow, wanderer, or similar transformers earlier in the chain.',
            'Wird von targetPoseInput, follow, wanderer oder ähnlichen Transformern gesetzt. Der zuletzt schreibende Transformer bestimmt den Wert.',
          )}
        </p>
        <ApiDocEntryList locale={locale} rows={TRANSFORM_TARGET_ROWS} />

        <p style={{ fontSize: 12, color: theme.text.muted, marginTop: 16 }}>
          {t(
            locale,
            `Top-level ${API_VEC_SECTION.titleEn.toLowerCase()} and aliases are listed above. Prefer api.vec in new code.`,
            `Oben findest du Hilfsfunktionen für Vektoren (${API_VEC_SECTION.titleDe}) und Kurzformen. In neuem Code am besten api.vec verwenden.`,
          )}
        </p>
      </div>
    ),
  }
}

function introChapter(locale: TransformerDocsLocale) {
  const de = locale === 'de'
  return {
    plainText: de
      ? 'Custom Transformer JavaScript transform Funktion TransformInput TransformOutput Monaco IntelliSense JSDoc Physik jeden Schritt'
      : 'Custom transformers JavaScript transform function TransformInput TransformOutput Monaco IntelliSense JSDoc physics each frame',
    keywords: ['intro', 'transformer', 'custom', 'code', 'basics', 'monaco', 'intellisense', 'überblick'],
    content: (
      <div lang={de ? 'de' : 'en'}>
        <p>
          {de ? (
            <>
              Ein <DocTerm term="custom_transformer"><code>custom</code></DocTerm>-Transformer ist{' '}
              <DocTerm term="JavaScript"><code>JavaScript</code></DocTerm>-Code, der in jedem Simulationsschritt läuft.
              Er liest <DocTerm term="TransformInput"><code>TransformInput</code></DocTerm>, darf{' '}
              <DocTerm term="actions"><code>input.actions</code></DocTerm> ändern und gibt{' '}
              <DocTerm term="TransformOutput"><code>TransformOutput</code></DocTerm> zurück — Kräfte, Impulse oder ein
              leeres <code>{'{}'}</code>.
            </>
          ) : (
            <>
              A <DocTerm term="custom_transformer"><code>custom</code></DocTerm> transformer is{' '}
              <DocTerm term="JavaScript"><code>JavaScript</code></DocTerm> that runs every physics step. It reads{' '}
              <DocTerm term="TransformInput"><code>TransformInput</code></DocTerm>, can change{' '}
              <DocTerm term="actions"><code>input.actions</code></DocTerm>, and returns{' '}
              <DocTerm term="TransformOutput"><code>TransformOutput</code></DocTerm> (forces, impulses, or{' '}
              <code>{'{}'}</code>).
            </>
          )}
        </p>
        <h3 style={subHeaderStyle}>{t(locale, 'Function shape', 'Signatur')}</h3>
        <p>
          {de ? (
            <>
              So sieht die Funktion aus:{' '}
              <DocTerm term="transform"><code>transform(input, dt, params, state, api)</code></DocTerm>. Was{' '}
              <DocTerm term="dt"><code>dt</code></DocTerm>, <DocTerm term="params"><code>params</code></DocTerm> und{' '}
              <DocTerm term="state"><code>state</code></DocTerm> bedeuten, steht im Kapitel{' '}
              <strong>API-Referenz</strong>. Die Namen im Code bleiben Englisch — so kannst du sie direkt übernehmen.
            </>
          ) : (
            <>
              Define <DocTerm term="transform"><code>transform(input, dt, params, state, api)</code></DocTerm>. Parameters{' '}
              <DocTerm term="dt"><code>dt</code></DocTerm>, <DocTerm term="params"><code>params</code></DocTerm>, and{' '}
              <DocTerm term="state"><code>state</code></DocTerm> are described in the <strong>API reference</strong>{' '}
              chapter. Code identifiers stay English so you can copy from the docs.
            </>
          )}
        </p>
        <DocCodeSample locale={locale} code={CANONICAL_FN} showLabel={false} />
        <p>
          {de ? (
            <>
              <DocTerm term="JSDoc">JSDoc</DocTerm> oder <code>@type</code>-Kommentare im Code helfen{' '}
              <DocTerm term="Monaco">Monaco</DocTerm> dabei, dir bei <DocTerm term="input_object"><code>input</code></DocTerm>{' '}
              und <DocTerm term="api"><code>api</code></DocTerm> Vorschläge zu machen (
              <DocTerm term="IntelliSense">IntelliSense</DocTerm>).
            </>
          ) : (
            <>
              <DocTerm term="JSDoc">JSDoc</DocTerm> or inline <code>@type</code> comments improve{' '}
              <DocTerm term="Monaco">Monaco</DocTerm> <DocTerm term="IntelliSense">IntelliSense</DocTerm> for{' '}
              <DocTerm term="input_object"><code>input</code></DocTerm> and <DocTerm term="api"><code>api</code></DocTerm>.
            </>
          )}
        </p>
        <p style={{ fontSize: 13, color: theme.text.muted }}>
          {t(
            locale,
            'Stack order: lower priority runs first. Typical car: input → your custom code → car2.',
            'Reihenfolge: Je kleiner priority, desto früher läuft der Schritt. Typisch fürs Auto: input → dein Code → car2.',
          )}
        </p>
      </div>
    ),
  }
}

function recipesChapter(locale: TransformerDocsLocale) {
  const de = locale === 'de'
  return {
    plainText: `${BASIC_MOVE} ${SYNTHETIC_FN} ${RAYCAST_FN} ${VIZ_FN} throttle steer car2 raycastSpread`,
    keywords: ['example', 'recipe', 'beispiel', 'movement', 'visualize', 'actions', 'throttle', 'steer', 'car2', 'raycast'],
    content: (
      <div lang={de ? 'de' : 'en'}>
        <h4 style={subHeaderStyle}>{t(locale, 'Move with an action', 'Bewegen mit einer Steuerung')}</h4>
        <DocCodeSample locale={locale} code={BASIC_MOVE} showLabel={false} />
        <p style={{ fontSize: 13, marginTop: -8 }}>
          {de ? (
            <>
              Der Name <DocTerm term="forward_action"><code>&apos;forward&apos;</code></DocTerm> muss in deiner{' '}
              <DocTerm term="input_preset"><code>input</code></DocTerm>-Tastenbelegung genau so heißen.
            </>
          ) : (
            <>
              The action name <DocTerm term="forward_action"><code>&apos;forward&apos;</code></DocTerm> must match your{' '}
              <DocTerm term="input_preset"><code>input</code></DocTerm> mapping.
            </>
          )}
        </p>

        <h4 style={subHeaderStyle}>
          {t(locale, 'Synthetic actions for car2', 'Steuerwerte für car2 setzen')}
        </h4>
        <p style={{ marginBottom: 12 }}>
          {de ? (
            <>
              Schreibe Werte in <DocTerm term="actions"><code>input.actions</code></DocTerm> und gib <code>{'{}'}</code>{' '}
              zurück. Dein <DocTerm term="custom_transformer"><code>custom</code></DocTerm>-Transformer sollte{' '}
              <strong>nach</strong> <DocTerm term="input_preset"><code>input</code></DocTerm> und <strong>vor</strong>{' '}
              <DocTerm term="car2"><code>car2</code></DocTerm> laufen. Für Timer: <DocTerm term="state"><code>state</code></DocTerm>{' '}
              + <DocTerm term="dt"><code>dt</code></DocTerm> (nicht <DocTerm term="new_Date"><code>new Date()</code></DocTerm> — das
              ist echte Uhrzeit).
            </>
          ) : (
            <>
              Write to <DocTerm term="actions"><code>input.actions</code></DocTerm> and return <code>{'{}'}</code>. Place
              your <DocTerm term="custom_transformer"><code>custom</code></DocTerm> stage <strong>after</strong>{' '}
              <DocTerm term="input_preset"><code>input</code></DocTerm> and <strong>before</strong>{' '}
              <DocTerm term="car2"><code>car2</code></DocTerm>. Use <DocTerm term="state"><code>state</code></DocTerm> +{' '}
              <DocTerm term="dt"><code>dt</code></DocTerm> for timers (not{' '}
              <DocTerm term="new_Date"><code>new Date()</code></DocTerm>).
            </>
          )}
        </p>
        <DocCodeSample locale={locale} code={SYNTHETIC_FN} showLabel={false} />

        <h4 style={subHeaderStyle}>{t(locale, 'Obstacle raycast', 'Hindernis mit Strahlmessung')}</h4>
        <p style={{ marginBottom: 12 }}>
          {t(
            locale,
            'Uses offsetAlong and raycastSpread — same pattern as AutoBrake in the hunt example world.',
            'Nutzt offsetAlong und raycastSpread — wie beim AutoBremsen in der Hunt-Beispielwelt.',
          )}
        </p>
        <DocCodeSample locale={locale} code={RAYCAST_FN} showLabel={false} />

        <h4 style={subHeaderStyle}>{t(locale, 'Visual debugging (Builder)', 'Werte im Builder anzeigen')}</h4>
        <DocCodeSample locale={locale} code={VIZ_FN} showLabel={false} />
        <p style={{ fontSize: 12, color: theme.text.muted }}>
          {t(
            locale,
            'api.visualize* works only in Builder with Visualize mode enabled.',
            'api.visualize* funktioniert nur im Builder, wenn der Visualize-Modus an ist.',
          )}
        </p>
      </div>
    ),
  }
}

function troubleshootingChapter(locale: TransformerDocsLocale) {
  const de = locale === 'de'
  return {
    plainText: de
      ? 'Kompilierfehler eval verboten Laufzeitfehler amber state bleibt Performance getWorldPosition getEntity'
      : 'Compile errors forbidden eval runtime amber stacktrace state persisted performance getWorldPosition getEntity',
    keywords: ['error', 'compile', 'runtime', 'debug', 'performance', 'eval', 'sandbox', 'fehler'],
    content: (
      <div lang={de ? 'de' : 'en'}>
        <ul>
          <li>
            <strong>{t(locale, 'Compile errors:', 'Kompilierfehler:')}</strong>{' '}
            {de ? (
              <>
                Syntaxfehler und verbotene Helfer wie <DocTerm term="eval"><code>eval</code></DocTerm> erscheinen unter dem
                Editor.
              </>
            ) : (
              <>
                Syntax errors and forbidden helpers like <DocTerm term="eval"><code>eval</code></DocTerm> appear under the
                editor.
              </>
            )}
          </li>
          <li>
            <strong>{t(locale, 'Runtime errors:', 'Laufzeitfehler:')}</strong>{' '}
            {de ? (
              <>
                Ausnahmen in <DocTerm term="transform"><code>transform()</code></DocTerm> erscheinen als gelbes Fenster
                mit Fehlerliste — im Spielen und im Builder.
              </>
            ) : (
              <>
                Exceptions in <DocTerm term="transform"><code>transform()</code></DocTerm> show an amber panel with a stack
                trace in Play / Builder.
              </>
            )}
          </li>
          <li>
            <strong>
              <DocTerm term="state">
                <code>state</code>
              </DocTerm>
              :
            </strong>{' '}
            {t(
              locale,
              'Persists between frames until the transformer is rebuilt (reload world or change config). Reset keys when testing.',
              'Bleibt zwischen den Schritten erhalten, bis der Transformer neu geladen wird (Welt neu laden oder Einstellung ändern). Beim Testen state-Werte zurücksetzen.',
            )}
          </li>
          <li>
            <strong>{t(locale, 'Performance:', 'Performance:')}</strong>{' '}
            {de ? (
              <>
                Wenn der Code oft pro Schritt läuft: lieber{' '}
                <DocTerm term="getWorldPosition"><code>getWorldPosition</code></DocTerm> als oft{' '}
                <DocTerm term="getEntity"><code>getEntity</code></DocTerm> aufrufen.
              </>
            ) : (
              <>
                Prefer <DocTerm term="getWorldPosition"><code>getWorldPosition</code></DocTerm> over repeated{' '}
                <DocTerm term="getEntity"><code>getEntity</code></DocTerm> calls in hot code.
              </>
            )}
          </li>
        </ul>
      </div>
    ),
  }
}

export function buildTransformerDocsChapters(locale: TransformerDocsLocale): TransformerDocChapter[] {
  const ct = chapterTitles(locale)

  return [
    { id: 'intro', title: ct.intro, ...introChapter(locale) },
    { id: 'api-reference', title: ct['api-reference'], ...apiReferenceChapter(locale) },
    { id: 'glossary', title: ct.glossary, ...glossaryChapter(locale) },
    { id: 'recipes', title: ct.recipes, ...recipesChapter(locale) },
    { id: 'troubleshooting', title: ct.troubleshooting, ...troubleshootingChapter(locale) },
  ]
}
