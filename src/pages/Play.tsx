import { useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import SceneView from '@/components/SceneView'
import { ErrorBoundary } from '@/components/ErrorBoundary'
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
  const world = useMemo(() => parseWorldFromSearchParams(searchParams), [searchParams])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #2f3545', background: '#171a22', color: '#e6e9f2' }}>
        <Link to="/">Back to Builder</Link>
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>
        <ErrorBoundary>
          <SceneView world={world} runPhysics runScripts />
        </ErrorBoundary>
      </main>
    </div>
  )
}
