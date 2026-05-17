import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SceneView from '@/components/SceneView'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { sampleWorld } from '@/data/sampleWorld'
import { validateWorldDocument } from '@/schema/validate'
import { migrateWorldScripts, migrateWorldSimplificationFields, migrateCustomTransformerNames, migrateWorldRingShapesToCylinder, migrateEntityTransformersToRegistry } from '@/scripts/migrateWorld'
import type { RennWorld } from '@/types/world'
import { defaultPersistence } from '@/persistence/indexedDb'

function normalizeLoadedWorld(data: unknown): RennWorld {
  migrateWorldScripts(data)
  migrateCustomTransformerNames(data)
  migrateEntityTransformersToRegistry(data)
  migrateWorldSimplificationFields(data)
  migrateWorldRingShapesToCylinder(data)
  validateWorldDocument(data, { tolerateAdditionalProperties: true, logAdditionalProperties: true })
  return data as RennWorld
}

function parseWorldFromSearchParams(searchParams: URLSearchParams): RennWorld {
  const worldParam = searchParams.get('world')
  if (worldParam) {
    try {
      const raw = JSON.parse(decodeURIComponent(worldParam)) as unknown
      return normalizeLoadedWorld(raw)
    } catch (err) {
      console.warn('[Play] Invalid world from URL param; falling back to sampleWorld:', err)
      return sampleWorld
    }
  }
  return sampleWorld
}

export default function Play() {
  const [searchParams] = useSearchParams()
  const sessionFlag = searchParams.has('session')

  const worldFromUrl = useMemo((): RennWorld | null => {
    if (sessionFlag) return null
    return parseWorldFromSearchParams(searchParams)
  }, [sessionFlag, searchParams])

  const [sessionWorld, setSessionWorld] = useState<RennWorld | null>(null)
  const [assets, setAssets] = useState<Map<string, Blob>>(new Map())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        const map = await defaultPersistence.loadAllAssets()
        if (cancelled) return
        setAssets(map)

        if (sessionFlag) {
          const raw = await defaultPersistence.loadPlaySessionWorld()
          if (cancelled) return
          if (raw) {
            try {
              setSessionWorld(normalizeLoadedWorld(raw))
            } catch (err) {
              console.warn('[Play] Invalid play session world; falling back to sampleWorld:', err)
              setSessionWorld(sampleWorld)
            }
          } else {
            console.warn('[Play] No play session in IndexedDB; falling back to sampleWorld')
            setSessionWorld(sampleWorld)
          }
        }
      } catch (err) {
        console.error('[Play] Bootstrap failed:', err)
        if (!cancelled && sessionFlag) setSessionWorld(sampleWorld)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [sessionFlag])

  const world =
    sessionFlag ? (sessionWorld ?? sampleWorld) : (worldFromUrl ?? sampleWorld)

  return (
    <div style={{ height: '100%' }}>
      {!ready ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#e6e9f2',
            background: '#171a22',
          }}
        >
          Loading…
        </div>
      ) : (
        <ErrorBoundary>
          <SceneView
            world={world}
            assets={assets}
            runPhysics
            runScripts
            showGameHud
            playMode
          />
        </ErrorBoundary>
      )}
    </div>
  )
}
