import { useState, useMemo, useEffect, useRef } from 'react'
import Modal from './Modal'
import { theme } from '@/config/theme'

interface DocChapter {
  id: string
  title: string
  content: React.ReactNode
  keywords: string[]
  plainText?: string // For full-text search
}

export interface TransformerDocsProps {
  isOpen: boolean
  onClose: () => void
}

export interface TransformerDocsContentProps {
  /** If true, the chapters sidebar is collapsed into a simple list or hidden. */
  forceCollapsedChapters?: boolean
  /** Optional extra header element (like search bar). */
  headerExtra?: React.ReactNode
}

export function TransformerDocsContent({ 
  forceCollapsedChapters = false,
  headerExtra 
}: TransformerDocsContentProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeChapterId, setActiveChapterId] = useState('intro')
  const [isSearching, setIsSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const chapters: DocChapter[] = useMemo(() => [
    {
      id: 'intro',
      title: 'Introduction',
      keywords: ['intro', 'transformer', 'custom', 'code', 'basics'],
      plainText: 'Custom transformers allow you to write JavaScript code that runs every frame to control an entity\'s physics behavior. They are ideal for creating complex movement patterns, vehicle physics, or interactive objects. Canonical Format The modern way to write a custom transformer is by defining a transform function. Legacy code (bare return statements) is still supported but wrapping it in a function is recommended for better IntelliSense and clarity.',
      content: (
        <div>
          <p>
            Custom transformers allow you to write JavaScript code that runs every frame to control an entity's physics behavior.
            They are ideal for creating complex movement patterns, vehicle physics, or interactive objects.
          </p>
          <h3 style={subHeaderStyle}>Canonical Format</h3>
          <p>
            The modern way to write a custom transformer is by defining a <code>transform</code> function:
          </p>
          <pre style={codeBlockStyle}>
{`/**
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
}`}
          </pre>
          <p>
            Using the JSDoc comments above helps Monaco provide better IntelliSense for the <code>input</code> and <code>api</code> objects.
          </p>
        </div>
      )
    },
    {
      id: 'api-input',
      title: 'API: TransformInput',
      keywords: ['input', 'velocity', 'rotation', 'actions', 'keys', 'environment'],
      plainText: 'The input object contains the current state of the entity and user inputs. actions: Mapped keyboard/wheel values (0–1 or -1–1). position: World-space position [x, y, z] in metres. rotation: Euler angles [x, y, z] in radians. velocity: World-space linear velocity (m/s). angularVelocity: World-space angular velocity (rad/s). environment: Grounded status, ground normal, etc. EnvironmentState isGrounded: True when on a supported ground surface. groundNormal: Surface normal at ground contact. isTouchingObject: True when in contact with any other collider.',
      content: (
        <div>
          <p>The <code>input</code> object contains the current state of the entity and user inputs.</p>
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
                <td style={tdStyle}><code>actions</code></td>
                <td style={tdStyle}><code>Record&lt;string, number&gt;</code></td>
                <td style={tdStyle}>Mapped keyboard/wheel values (0–1 or -1–1).</td>
              </tr>
              <tr>
                <td style={tdStyle}><code>position</code></td>
                <td style={tdStyle}><code>Vec3</code></td>
                <td style={tdStyle}>World-space position <code>[x, y, z]</code> in metres.</td>
              </tr>
              <tr>
                <td style={tdStyle}><code>rotation</code></td>
                <td style={tdStyle}><code>Rotation</code></td>
                <td style={tdStyle}>Euler angles <code>[x, y, z]</code> in radians.</td>
              </tr>
              <tr>
                <td style={tdStyle}><code>velocity</code></td>
                <td style={tdStyle}><code>Vec3</code></td>
                <td style={tdStyle}>World-space linear velocity (m/s).</td>
              </tr>
              <tr>
                <td style={tdStyle}><code>angularVelocity</code></td>
                <td style={tdStyle}><code>Vec3</code></td>
                <td style={tdStyle}>World-space angular velocity (rad/s).</td>
              </tr>
              <tr>
                <td style={tdStyle}><code>environment</code></td>
                <td style={tdStyle}><code>EnvironmentState</code></td>
                <td style={tdStyle}>Grounded status, ground normal, etc.</td>
              </tr>
            </tbody>
          </table>
          <h4 style={subHeaderStyle}>EnvironmentState</h4>
          <ul>
            <li><code>isGrounded</code>: True when on a supported ground surface.</li>
            <li><code>groundNormal</code>: Surface normal at ground contact.</li>
            <li><code>isTouchingObject</code>: True when in contact with any other collider.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'api-output',
      title: 'API: TransformOutput',
      keywords: ['output', 'impulse', 'torque', 'velocity', 'position', 'rotation', 'color'],
      plainText: 'The transform function should return an object specifying physics changes: force: Continuous force added this frame (N). impulse: Instantaneous impulse (N·s). torque: Continuous torque added this frame. linvel: Directly set linear velocity (overrides physics). addRotation: Euler delta added to rotation (rad). color: Mesh color override [r, g, b] (0–1).',
      content: (
        <div>
          <p>The <code>transform</code> function should return an object specifying physics changes:</p>
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
                <td style={tdStyle}><code>force</code></td>
                <td style={tdStyle}><code>Vec3</code></td>
                <td style={tdStyle}>Continuous force added this frame (N).</td>
              </tr>
              <tr>
                <td style={tdStyle}><code>impulse</code></td>
                <td style={tdStyle}><code>Vec3</code></td>
                <td style={tdStyle}>Instantaneous impulse (N·s).</td>
              </tr>
              <tr>
                <td style={tdStyle}><code>torque</code></td>
                <td style={tdStyle}><code>Vec3</code></td>
                <td style={tdStyle}>Continuous torque added this frame.</td>
              </tr>
              <tr>
                <td style={tdStyle}><code>linvel</code></td>
                <td style={tdStyle}><code>Vec3</code></td>
                <td style={tdStyle}>Directly set linear velocity (overrides physics).</td>
              </tr>
              <tr>
                <td style={tdStyle}><code>addRotation</code></td>
                <td style={tdStyle}><code>Rotation</code></td>
                <td style={tdStyle}>Euler delta added to rotation (rad).</td>
              </tr>
              <tr>
                <td style={tdStyle}><code>color</code></td>
                <td style={tdStyle}><code>Vec3</code></td>
                <td style={tdStyle}>Mesh color override <code>[r, g, b]</code> (0–1).</td>
              </tr>
            </tbody>
          </table>
        </div>
      )
    },
    {
      id: 'api-runtime',
      title: 'API: TransformerRuntimeApi',
      keywords: ['api', 'vec', 'math', 'log', 'visualize', 'world', 'position', 'clamp'],
      plainText: 'The api object provides helper methods for common tasks. Vector Math (api.vec) api.vec.add(a, b): Component-wise sum of two vectors. api.vec.scale(v, s): Scale a vector by a scalar. api.vec.length(v): Get the Euclidean length of a vector. api.vec.dot(a, b): Dot product of two vectors. api.vec.getForwardVector(rotation): Get forward unit vector (-Z facing). api.vec.getUpVector(rotation): Get up unit vector (+Y). api.vec.getForwardSpeed(velocity, forward): Signed scalar speed along forward. Utilities api.getAction(input, name): Safely read mapped input actions. api.clamp(value, min, max): Clamp value inclusively. api.log(message, duration?): Show a message in the play-mode snackbar. api.visualize(value, color, name, index): Push a numeric sample to the variable overlay (index 1-16). api.visualizeCoordinate(pos, color): Draw a line to a world-space coordinate. api.getWorldPosition(id): Get live position from physics cache. api.getEntity(id): Get a shallow snapshot of an entity.',
      content: (
        <div>
          <p>The <code>api</code> object provides helper methods for common tasks.</p>
          <h4 style={subHeaderStyle}>Vector Math (<code>api.vec</code>)</h4>
          <ul>
            <li><code>api.vec.add(a, b)</code>: Component-wise sum of two vectors.</li>
            <li><code>api.vec.scale(v, s)</code>: Scale a vector by a scalar.</li>
            <li><code>api.vec.length(v)</code>: Get the Euclidean length of a vector.</li>
            <li><code>api.vec.dot(a, b)</code>: Dot product of two vectors.</li>
            <li><code>api.vec.getForwardVector(rotation)</code>: Get forward unit vector (-Z facing).</li>
            <li><code>api.vec.getUpVector(rotation)</code>: Get up unit vector (+Y).</li>
            <li><code>api.vec.getForwardSpeed(velocity, forward)</code>: Signed scalar speed along <code>forward</code>.</li>
          </ul>
          <h4 style={subHeaderStyle}>Utilities</h4>
          <ul>
            <li><code>api.getAction(input, name)</code>: Safely read mapped input actions.</li>
            <li><code>api.clamp(value, min, max)</code>: Clamp value inclusively.</li>
            <li><code>api.log(message, duration?)</code>: Show a message in the play-mode snackbar.</li>
            <li><code>api.visualize(value, color, name, index)</code>: Visualize a numeric value in the Builder overlay (index 1-16).</li>
            <li><code>api.visualizeCoordinate(pos, color)</code>: Draw a line to a world-space coordinate.</li>
            <li><code>api.getWorldPosition(id)</code>: Get live position from physics cache.</li>
            <li><code>api.getEntity(id)</code>: Get a shallow snapshot of an entity.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'recipes',
      title: 'Recipes & Examples',
      keywords: ['example', 'recipe', 'jump', 'hover', 'movement', 'visualize'],
      plainText: 'Basic Movement function transform(input, dt, params, state, api) { const forward = api.vec.getForwardVector(input.rotation); const power = api.getAction(input, \'forward\') * 100; return { force: api.vec.scale(forward, power) }; } Visualize Debugging function transform(input, dt, params, state, api) { const speed = api.vec.length(input.velocity); api.visualize(speed, \'#00ff00\', \'Speed\', 1); const target = [0, 5, 0]; api.visualizeCoordinate(target, \'red\'); return {}; }',
      content: (
        <div>
          <h4 style={subHeaderStyle}>Basic Movement</h4>
          <pre style={codeBlockStyle}>
{`function transform(input, dt, params, state, api) {
  const forward = api.vec.getForwardVector(input.rotation);
  const power = api.getAction(input, 'forward') * 100;
  
  return {
    force: api.vec.scale(forward, power)
  };
}`}
          </pre>
          <h4 style={subHeaderStyle}>Visualize Debugging</h4>
          <pre style={codeBlockStyle}>
{`function transform(input, dt, params, state, api) {
  const speed = api.vec.length(input.velocity);
  api.visualize(speed, '#00ff00', 'Speed', 1);
  
  const target = [0, 5, 0];
  api.visualizeCoordinate(target, 'red');
  
  return {};
}`}
          </pre>
        </div>
      )
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      keywords: ['error', 'compile', 'runtime', 'debug', 'performance'],
      plainText: 'Compile Errors: Syntax errors or forbidden patterns (like eval) are shown in the panel below the editor. Runtime Errors: Uncaught exceptions inside transform() appear in an amber panel with a stack trace. State Preservation: Use the state object to store values between frames. It is cleared when the transformer is recreated. Performance: Transformers run every frame. Avoid api.getEntity on hot paths; prefer api.getWorldPosition.',
      content: (
        <div>
          <ul>
            <li><strong>Compile Errors:</strong> Syntax errors or forbidden patterns (like <code>eval</code>) are shown in the panel below the editor.</li>
            <li><strong>Runtime Errors:</strong> Uncaught exceptions inside <code>transform()</code> appear in an amber panel with a stack trace.</li>
            <li><strong>State Preservation:</strong> Use the <code>state</code> object to store values between frames. It is cleared when the transformer is recreated.</li>
            <li><strong>Performance:</strong> Transformers run every frame. Avoid <code>api.getEntity</code> on hot paths; prefer <code>api.getWorldPosition</code>.</li>
          </ul>
        </div>
      )
    }
  ], [])

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    
    const words = query.split(/\s+/).filter(w => w.length > 0)
    if (words.length === 0) return []

    return chapters.map(chapter => {
      const title = chapter.title.toLowerCase()
      const keywords = chapter.keywords.map(k => k.toLowerCase())
      const plainText = (chapter.plainText || '').toLowerCase()
      
      // Check if all words are present somewhere in the chapter
      const allWordsMatch = words.every(word => 
        title.includes(word) || 
        keywords.some(k => k.includes(word)) || 
        plainText.includes(word)
      )

      if (!allWordsMatch) return null

      let score = 0
      words.forEach(word => {
        if (title.includes(word)) score += 10
        if (keywords.some(k => k.includes(word))) score += 5
        if (plainText.includes(word)) score += 1
      })

      // Find the best snippet: the one containing the first word found in plainText
      let snippet = chapter.title
      const firstWordInText = words.find(word => plainText.includes(word))
      
      if (firstWordInText && chapter.plainText) {
        const index = plainText.indexOf(firstWordInText)
        const start = Math.max(0, index - 40)
        const end = Math.min(chapter.plainText.length, index + firstWordInText.length + 40)
        snippet = chapter.plainText.substring(start, end)
        if (start > 0) snippet = '...' + snippet
        if (end < chapter.plainText.length) snippet = snippet + '...'
      }
      
      return { chapter, score, snippet }
    }).filter((r): r is { chapter: DocChapter; score: number; snippet: string } => r !== null)
      .sort((a, b) => b.score - a.score)
  }, [chapters, searchQuery])

  const activeChapter = chapters.find(c => c.id === activeChapterId) || chapters[0]

  const handleResultClick = (chapterId: string) => {
    setActiveChapterId(chapterId)
    setIsSearching(false)
    setSearchQuery('')
  }

  const searchBar = (
    <div style={{ position: 'relative', flex: 1, maxWidth: 300, marginLeft: headerExtra ? 20 : 0 }}>
      <input
        ref={searchInputRef}
        type="search"
        placeholder="Search documentation..."
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value)
          setIsSearching(e.target.value.trim().length > 0)
        }}
        onFocus={() => {
          if (searchQuery.trim().length > 0) setIsSearching(true)
        }}
        style={{
          width: '100%',
          padding: '6px 12px',
          background: theme.bg.input,
          border: `1px solid ${theme.border.default}`,
          borderRadius: 4,
          color: theme.text.primary,
          fontSize: 13,
          outline: 'none'
        }}
      />
      {isSearching && searchResults.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: theme.bg.panelAlt,
          border: `1px solid ${theme.border.default}`,
          borderRadius: '0 0 4px 4px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          zIndex: 1000,
          maxHeight: 400,
          overflowY: 'auto'
        }}>
          {searchResults.map(({ chapter, snippet }) => (
            <div
              key={chapter.id}
              onClick={() => handleResultClick(chapter.id)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                borderBottom: `1px solid ${theme.border.default}`,
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = theme.bg.surface}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: theme.text.primary }}>
                {chapter.title}
              </div>
              <div style={{ fontSize: 11, color: theme.text.muted, lineHeight: 1.4 }}>
                {snippet}
              </div>
            </div>
          ))}
        </div>
      )}
      {isSearching && searchResults.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: theme.bg.panelAlt,
          border: `1px solid ${theme.border.default}`,
          borderRadius: '0 0 4px 4px',
          padding: '12px',
          color: theme.text.muted,
          fontSize: 12,
          zIndex: 1000
        }}>
          No results found for "{searchQuery}"
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: theme.text.primary, overflow: 'hidden' }}>
      {(headerExtra || searchBar) && (
        <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 12, borderBottom: `1px solid ${theme.border.default}`, marginBottom: 16 }}>
          {headerExtra}
          {searchBar}
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        {!forceCollapsedChapters && (
          <div style={{ 
            width: 160, 
            borderRight: `1px solid ${theme.border.default}`, 
            display: 'flex', 
            flexDirection: 'column',
            paddingRight: 12,
            flexShrink: 0
          }}>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {chapters.map(chapter => (
                <div
                  key={chapter.id}
                  onClick={() => setActiveChapterId(chapter.id)}
                  style={{
                    padding: '8px 10px',
                    cursor: 'pointer',
                    borderRadius: 4,
                    marginBottom: 2,
                    fontSize: 13,
                    background: activeChapterId === chapter.id ? theme.bg.surface : 'transparent',
                    color: activeChapterId === chapter.id ? theme.text.primary : theme.text.muted,
                    transition: 'all 0.15s ease',
                    fontWeight: activeChapterId === chapter.id ? 600 : 400
                  }}
                  onMouseEnter={(e) => {
                    if (activeChapterId !== chapter.id) {
                      e.currentTarget.style.background = theme.bg.panel
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeChapterId !== chapter.id) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {chapter.title}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, paddingLeft: forceCollapsedChapters ? 0 : 20, overflowY: 'auto' }}>
          {forceCollapsedChapters && (
            <div style={{ marginBottom: 16 }}>
              <select
                value={activeChapterId}
                onChange={(e) => setActiveChapterId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 13,
                  borderRadius: 4,
                  border: `1px solid ${theme.border.default}`,
                  background: theme.bg.panelAlt,
                  color: theme.text.primary,
                }}
              >
                {chapters.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          )}
          <h2 style={{ marginTop: 0, marginBottom: 16, borderBottom: `1px solid ${theme.border.default}`, paddingBottom: 8, fontSize: 18 }}>
            {activeChapter.title}
          </h2>
          <div style={{ lineHeight: 1.6, fontSize: 14 }}>
            {activeChapter.content}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TransformerDocs({ isOpen, onClose }: TransformerDocsProps) {
  useEffect(() => {
    if (!isOpen) return
    // Reset any state if needed when opening
  }, [isOpen])

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Transformer Coding Documentation" 
      width={900} 
      height={700}
    >
      <TransformerDocsContent />
    </Modal>
  )
}

const subHeaderStyle: React.CSSProperties = {
  marginTop: 24,
  marginBottom: 12,
  fontSize: 16,
  fontWeight: 600,
  color: theme.text.primary
}

const codeBlockStyle: React.CSSProperties = {
  background: '#1e1e1e',
  color: '#d4d4d4',
  padding: '16px',
  borderRadius: '8px',
  overflowX: 'auto',
  fontSize: '13px',
  fontFamily: 'monospace',
  margin: '16px 0',
  border: '1px solid #333',
  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  margin: '16px 0',
  fontSize: '13px'
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px',
  borderBottom: `2px solid ${theme.border.default}`,
  color: theme.text.muted,
  fontWeight: 600
}

const tdStyle: React.CSSProperties = {
  padding: '10px',
  borderBottom: `1px solid ${theme.border.default}`,
  verticalAlign: 'top'
}
