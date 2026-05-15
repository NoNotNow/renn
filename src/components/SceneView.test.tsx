import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import SceneView, { type SceneViewHandle } from '@/components/SceneView'
import {
  BUILDER_SCENE_CANVAS_HOST_ATTR,
  SUPPRESS_ESCAPE_SCENE_FOCUS_ATTR,
} from '@/config/constants'
import type { RennWorld } from '@/types/world'

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class MockWebGLRenderer {
    domElement = document.createElement('canvas')
    shadowMap = { enabled: true, type: 0 }
    setSize() {}
    setPixelRatio() {}
    dispose() {}
    render() {}
  }
  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  }
})

const minimalWorld: RennWorld = {
  version: '1.0',
  world: {
    gravity: [0, -9.81, 0],
    camera: { control: 'free', mode: 'follow', target: 'box', distance: 10, height: 2 },
  },
  entities: [
    {
      id: 'box',
      bodyType: 'static',
      shape: { type: 'box', width: 1, height: 1, depth: 1 },
      position: [0, 0, 0],
    },
  ],
}

describe('SceneView', () => {
  let requestAnimationFrameId: number
  let playSpy: ReturnType<typeof vi.fn>
  let pauseSpy: ReturnType<typeof vi.fn>
  let originalAudio: typeof Audio

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      requestAnimationFrameId = setTimeout(cb, 0) as unknown as number
      return requestAnimationFrameId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    )
    playSpy = vi.fn(async () => {})
    pauseSpy = vi.fn(() => {})
    originalAudio = globalThis.Audio
    vi.stubGlobal(
      'Audio',
      class MockAudio {
        loop = false
        volume = 1
        src = ''
        dataset: DOMStringMap = {}
        constructor(public _url?: string) {}
        play = playSpy
        pause = pauseSpy
      } as unknown as typeof Audio
    )
  })

  afterEach(() => {
    vi.stubGlobal('Audio', originalAudio)
    vi.unstubAllGlobals()
  })

  it('renders a container div', () => {
    render(<SceneView world={minimalWorld} runPhysics={false} runScripts={false} />)
    const container = document.querySelector('div[style*="width: 100%"]')
    expect(container).toBeInTheDocument()
  })

  it('hides scene bootstrap overlay after loadWorld completes', async () => {
    render(<SceneView world={minimalWorld} runPhysics={false} runScripts={false} />)
    expect(document.querySelector('[data-testid="scene-bootstrap-loading"]')).toBeInTheDocument()
    await waitFor(() => {
      expect(document.querySelector('[data-testid="scene-bootstrap-loading"]')).not.toBeInTheDocument()
    })
  })

  it('Escape from a focused input moves focus to the scene canvas host', async () => {
    render(<SceneView world={minimalWorld} runPhysics={false} runScripts={false} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="scene-bootstrap-loading"]')).not.toBeInTheDocument()
    })
    const host = document.querySelector(`[${BUILDER_SCENE_CANVAS_HOST_ATTR}]`)
    expect(host).toBeTruthy()

    const input = document.createElement('input')
    input.type = 'text'
    document.body.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })

    expect(document.activeElement).toBe(host)
    document.body.removeChild(input)
  })

  it('Escape does not steal focus when the editable target has suppress attribute', async () => {
    render(<SceneView world={minimalWorld} runPhysics={false} runScripts={false} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="scene-bootstrap-loading"]')).not.toBeInTheDocument()
    })

    const input = document.createElement('input')
    input.type = 'text'
    input.setAttribute(SUPPRESS_ESCAPE_SCENE_FOCUS_ATTR, '')
    document.body.appendChild(input)
    input.focus()

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    })

    expect(document.activeElement).toBe(input)
    document.body.removeChild(input)
  })

  it('renders without error when given editor props', () => {
    const onSelectEntity = vi.fn()
    const onEntityPoseCommit = vi.fn()
    expect(() => {
      render(
        <SceneView
          world={minimalWorld}
          runPhysics={false}
          runScripts={false}
          selectedEntityIds={[]}
          onSelectEntity={onSelectEntity}
          onEntityPoseCommit={onEntityPoseCommit}
        />
      )
    }).not.toThrow()
    expect(onSelectEntity).not.toHaveBeenCalled()
    expect(onEntityPoseCommit).not.toHaveBeenCalled()
  })

  it('renders without error when world shadowsEnabled is false', () => {
    expect(() => {
      render(
        <SceneView
          world={{
            ...minimalWorld,
            world: { ...minimalWorld.world, shadowsEnabled: false },
          }}
          runPhysics={false}
          runScripts={false}
        />
      )
    }).not.toThrow()
    const container = document.querySelector('div[style*="width: 100%"]')
    expect(container).toBeInTheDocument()
  })

  it('exposes setViewPreset via ref', () => {
    const ref = { current: null as SceneViewHandle | null }
    render(
      <SceneView ref={ref} world={minimalWorld} runPhysics={false} runScripts={false} />
    )
    expect(ref.current).not.toBeNull()
    expect(ref.current?.setViewPreset).toBeTypeOf('function')
    expect(() => ref.current?.setViewPreset('top')).not.toThrow()
    expect(() => ref.current?.setViewPreset('front')).not.toThrow()
    expect(() => ref.current?.setViewPreset('right')).not.toThrow()
  })

  it('applies world sound settings and responds to manual playback command', () => {
    const worldWithSound: RennWorld = {
      ...minimalWorld,
      world: {
        ...minimalWorld.world,
        sound: {
          assetId: 'bgm',
          volume: 0.6,
          loop: true,
          autoplay: false,
        },
      },
      assets: {
        bgm: { type: 'audio', path: 'assets/bgm.mp3' },
      },
    }
    const assets = new Map<string, Blob>([['bgm', new Blob(['abc'], { type: 'audio/mpeg' })]])
    const { rerender } = render(
      <SceneView world={worldWithSound} assets={assets} runPhysics={false} runScripts={false} />
    )
    expect(playSpy).not.toHaveBeenCalled()
    rerender(
      <SceneView
        world={worldWithSound}
        assets={assets}
        runPhysics={false}
        runScripts={false}
        soundPlaybackCommand={{ action: 'play', nonce: 1 }}
      />
    )
    expect(playSpy).toHaveBeenCalled()
    rerender(
      <SceneView
        world={worldWithSound}
        assets={assets}
        runPhysics={false}
        runScripts={false}
        soundPlaybackCommand={{ action: 'stop', nonce: 2 }}
      />
    )
    expect(pauseSpy).toHaveBeenCalled()
  })
})
