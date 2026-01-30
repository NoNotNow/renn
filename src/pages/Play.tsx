import { useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import SceneView from '@/components/SceneView'
import { sampleWorld } from '@/data/sampleWorld'
import { validateWorldDocument } from '@/schema/validate'
import type { RennWorld } from '@/types/world'

function parseWorldFromSearchParams(searchParams: URLSearchParams): RennWorld {
  const worldParam = searchParams.get('world')
  if (worldParam) {
    try {
      const data = JSON.parse(decodeURIComponent(worldParam)) as unknown
      validateWorldDocument(data)
      return data as RennWorld
    } catch {
      return sampleWorld
    }
  }
  return sampleWorld
}

export default function Play() {
  const [searchParams] = useSearchParams()
  const [gravityEnabled, setGravityEnabled] = useState(true)
  const world = useMemo(() => parseWorldFromSearchParams(searchParams), [searchParams])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #ccc' }}>
        <Link to="/">Back to Builder</Link>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <span>Gravity</span>
          <button
            type="button"
            role="switch"
            aria-checked={gravityEnabled}
            onClick={() => setGravityEnabled((v) => !v)}
            style={{
              width: 40,
              height: 22,
              borderRadius: 11,
              border: '1px solid #888',
              background: gravityEnabled ? '#4a9' : '#ccc',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: gravityEnabled ? 20 : 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                transition: 'left 0.15s ease',
              }}
            />
          </button>
        </label>
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>
        <SceneView world={world} runPhysics runScripts gravityEnabled={gravityEnabled} />
      </main>
    </div>
  )
}
