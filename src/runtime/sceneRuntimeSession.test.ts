import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
import {
  buildSceneRuntimeRestartKey,
  createSceneRuntimeSession,
  createSceneRuntimeSessionStub,
  type SceneRuntimeHostCallbacks,
  type SceneRuntimeRuntimeDeps,
} from './sceneRuntimeSession'
import {
  disposeAssetResolverIfStaleLoadWorld,
  isStaleSceneRuntimeLoadGeneration,
} from './sceneRuntimeSessionLoad'
import {
  canApplySceneRuntimeRegistryGeneration,
  runSceneRuntimePhysicsAndRegistry,
} from './sceneRuntimeSessionPhysics'
import { disposeSceneRuntimeSession } from './sceneRuntimeSessionTeardown'
import { RenderItemRegistry } from '@/runtime/renderItemRegistry'
import { restoreInitialPosesIntoRegistry } from '@/runtime/restoreInitialPoses'
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
  world: { gravity: [0, -9.81, 0] },
  entities: [],
}

function createHostSpy(): SceneRuntimeHostCallbacks {
  return {
    setSceneBootstrapPending: vi.fn(),
    setScene: vi.fn(),
    setCamera: vi.fn(),
    setRenderer: vi.fn(),
    setWorldLoadError: vi.fn(),
    setSchemaLoadWarnings: vi.fn(),
    setRegistryEpoch: vi.fn(),
    setScriptSnackbarMessage: vi.fn(),
    setHudScore: vi.fn(),
    setHudDamage: vi.fn(),
    setHudDrive: vi.fn(),
    resetHud: vi.fn(),
  }
}

function createMinimalHandleBag(): import('./sceneRuntimeSession').SceneRuntimeHandleBag {
  const mk = <T>(v: T) => ({ current: v })
  return {
    effectIdRef: mk(0),
    assetResolverRef: mk(null),
    entitiesRef: mk([]),
    registryRef: mk(null),
    cameraCtrlRef: mk(null),
    avatarSessionRef: mk(null),
    physicsRef: mk(null),
    scriptRunnerRef: mk(null),
    css2dRendererRef: mk(null),
    variableOverlayControllerRef: mk(null),
    coordinateOverlayControllerRef: mk(null),
    frameRef: mk(0),
    frameTimingRef: mk(null),
    resizeHandlerRef: mk(null),
    savedCameraStateRef: mk(null),
    disposePickGizmoRef: mk(null),
    syncGizmoAttachRef: mk(null),
    gizmoDraggingRef: mk(false),
    worldRef: mk(minimalWorld),
    assetsRef: mk(new Map()),
    playModeRef: mk(false),
    editNavigationModeRef: mk(false),
    runPhysicsRef: mk(true),
    runScriptsRef: mk(true),
    rawKeyboardRef: mk(null),
    rawWheelRef: mk(null),
    timeRef: mk(0),
    recordFrameStatsOverlayRef: mk(false),
    activeDebugForcesRef: mk([]),
    freeFlyKeysRef: mk(null),
    rawMouseDragRef: mk(null),
    orbitWheelRef: mk({ deltaX: 0, deltaY: 0, distanceDelta: 0 }),
    lastEditorPoseWriteTimeRef: mk(0),
    selectedEntityIdsRef: mk([]),
    gizmoModeRef: mk('translate'),
    onSelectEntityRef: mk(undefined),
    onEntityPoseCommitRef: mk(undefined),
    onCurrentAvatarChangeRef: mk(undefined),
    onTexturePaintStrokeEndRef: mk(undefined),
    pushUndoBeforePaintStrokeRef: mk(undefined),
    textureBrushRgbRef: mk([1, 1, 1]),
    textureBrushAlphaRef: mk(1),
    textureBrushRadiusPxRef: mk(8),
    getPaintTargetAssetIdRef: mk(undefined),
    prepareWorldPaintStrokeRef: mk(undefined),
    showGameHudRef: mk(false),
    hudPatchBridgeRef: mk(() => {}),
    lastHudDriveRef: mk(null),
    skyDomeRef: mk(null),
    coordinateOverlayDisplayVidRef: mk(null),
  }
}

describe('buildSceneRuntimeRestartKey', () => {
  const base = {
    sceneKey: 'k1',
    sceneVersion: 0,
    shadowsEnabled: true,
    logarithmicDepthBuffer: undefined,
    worldShadowsEnabled: undefined,
    videoTextureMaxAnisotropy: undefined,
    playMode: false,
  }

  it('changes when sceneKey changes', () => {
    const a = buildSceneRuntimeRestartKey(base)
    const b = buildSceneRuntimeRestartKey({ ...base, sceneKey: 'k2' })
    expect(a).not.toBe(b)
  })

  it('changes when sceneVersion prop changes', () => {
    const a = buildSceneRuntimeRestartKey(base)
    const b = buildSceneRuntimeRestartKey({ ...base, sceneVersion: 1 })
    expect(a).not.toBe(b)
  })

  it('is stable for identical inputs', () => {
    expect(buildSceneRuntimeRestartKey(base)).toBe(buildSceneRuntimeRestartKey({ ...base }))
  })

  it('includes playMode and render-quality flags', () => {
    const a = buildSceneRuntimeRestartKey(base)
    const b = buildSceneRuntimeRestartKey({ ...base, playMode: true })
    const c = buildSceneRuntimeRestartKey({ ...base, logarithmicDepthBuffer: true })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('isStaleSceneRuntimeLoadGeneration', () => {
  it('is stale when cancelled', () => {
    expect(isStaleSceneRuntimeLoadGeneration(true, { current: 1 }, 1)).toBe(true)
  })

  it('is stale when effectId differs', () => {
    expect(isStaleSceneRuntimeLoadGeneration(false, { current: 2 }, 1)).toBe(true)
  })

  it('is fresh when active and effectId matches', () => {
    expect(isStaleSceneRuntimeLoadGeneration(false, { current: 3 }, 3)).toBe(false)
  })
})

vi.mock('@/runtime/renderItemRegistry', () => ({
  RenderItemRegistry: {
    create: vi.fn(() => ({ mockRegistry: true, clear: vi.fn() })),
  },
}))

vi.mock('@/runtime/restoreInitialPoses', () => ({
  restoreInitialPosesIntoRegistry: vi.fn(),
}))

describe('canApplySceneRuntimeRegistryGeneration', () => {
  it('is false when cancelled', () => {
    expect(canApplySceneRuntimeRegistryGeneration(true, { current: 1 }, 1)).toBe(false)
  })

  it('is false when effectId differs', () => {
    expect(canApplySceneRuntimeRegistryGeneration(false, { current: 2 }, 1)).toBe(false)
  })

  it('is true when active and effectId matches', () => {
    expect(canApplySceneRuntimeRegistryGeneration(false, { current: 3 }, 3)).toBe(true)
  })
})

describe('runSceneRuntimePhysicsAndRegistry', () => {
  beforeEach(() => {
    vi.mocked(RenderItemRegistry.create).mockClear()
    vi.mocked(restoreInitialPosesIntoRegistry).mockClear()
  })

  it('sync path sets registry epoch when runPhysics is false', () => {
    const host = createHostSpy()
    const handles = createMinimalHandleBag()
    const installPickGizmoIfBuilder = vi.fn()
    runSceneRuntimePhysicsAndRegistry({
      config: {
        world: minimalWorld,
        restartKey: 'k',
        host,
        container: document.createElement('div'),
        handles,
        runPhysics: false,
        runScripts: false,
        shadowsEnabled: true,
      },
      host,
      handles,
      deps: createSessionTestDeps(vi.fn() as never),
      cancelled: false,
      currentEffectId: handles.effectIdRef.current,
      loadedWorld: minimalWorld,
      entities: [],
      installPickGizmoIfBuilder,
    })

    expect(RenderItemRegistry.create).toHaveBeenCalledWith(
      [],
      null,
      expect.any(Function),
      undefined,
      undefined,
      undefined,
    )
    expect(handles.registryRef.current).toMatchObject({ mockRegistry: true })
    expect(restoreInitialPosesIntoRegistry).toHaveBeenCalled()
    expect(installPickGizmoIfBuilder).toHaveBeenCalled()
    expect(host.setRegistryEpoch).toHaveBeenCalledWith(expect.any(Function))
  })

  it('async physics path assigns registry when effect stays active', async () => {
    const host = createHostSpy()
    const handles = createMinimalHandleBag()
    handles.effectIdRef.current = 1
    const pwDispose = vi.fn()
    const setGravity = vi.fn()
    const createPhysicsWorld = vi.fn(() =>
      Promise.resolve({ dispose: pwDispose, setGravity }),
    )
    const deps = createSessionTestDeps(vi.fn() as never)
    deps.importRapierPhysics = vi.fn(() =>
      Promise.resolve({ createPhysicsWorld } as never),
    )

    runSceneRuntimePhysicsAndRegistry({
      config: {
        world: minimalWorld,
        restartKey: 'k',
        host,
        container: document.createElement('div'),
        handles,
        runPhysics: true,
        runScripts: false,
        shadowsEnabled: true,
      },
      host,
      handles,
      deps,
      cancelled: false,
      currentEffectId: 1,
      loadedWorld: minimalWorld,
      entities: [],
      installPickGizmoIfBuilder: vi.fn(),
    })

    await vi.waitFor(() => {
      expect(handles.physicsRef.current).not.toBeNull()
    })
    expect(setGravity).toHaveBeenCalled()
    expect(host.setRegistryEpoch).toHaveBeenCalled()
    expect(pwDispose).not.toHaveBeenCalled()
  })

  it('disposes pw when physics completes after effectId bump', async () => {
    const host = createHostSpy()
    const handles = createMinimalHandleBag()
    handles.effectIdRef.current = 1
    const pwDispose = vi.fn()
    let resolvePw!: (pw: { dispose: () => void; setGravity: () => void }) => void
    const createPhysicsWorld = vi.fn(
      () =>
        new Promise<{ dispose: () => void; setGravity: () => void }>((resolve) => {
          resolvePw = resolve
        }),
    )
    const deps = createSessionTestDeps(vi.fn() as never)
    deps.importRapierPhysics = vi.fn(() =>
      Promise.resolve({ createPhysicsWorld } as never),
    )

    runSceneRuntimePhysicsAndRegistry({
      config: {
        world: minimalWorld,
        restartKey: 'k',
        host,
        container: document.createElement('div'),
        handles,
        runPhysics: true,
        runScripts: false,
        shadowsEnabled: true,
      },
      host,
      handles,
      deps,
      cancelled: false,
      currentEffectId: 1,
      loadedWorld: minimalWorld,
      entities: [],
      installPickGizmoIfBuilder: vi.fn(),
    })

    await Promise.resolve()
    handles.effectIdRef.current = 2
    resolvePw({ dispose: pwDispose, setGravity: vi.fn() })
    await Promise.resolve()

    expect(pwDispose).toHaveBeenCalledTimes(1)
    expect(handles.physicsRef.current).toBeNull()
    expect(host.setRegistryEpoch).not.toHaveBeenCalled()
  })
})

describe('disposeAssetResolverIfStaleLoadWorld', () => {
  it('disposes resolver when present', () => {
    const dispose = vi.fn()
    disposeAssetResolverIfStaleLoadWorld({ dispose } as never)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('no-ops when resolver is null', () => {
    expect(() => disposeAssetResolverIfStaleLoadWorld(null)).not.toThrow()
  })
})

function createSessionTestDeps(
  loadWorldImpl: SceneRuntimeRuntimeDeps['loadWorld'],
): SceneRuntimeRuntimeDeps {
  return {
    loadWorld: loadWorldImpl,
    warmUpRendererTextures: vi.fn(),
    scheduleMaterialTextureDecodePrefetch: vi.fn(() => ({ cancel: vi.fn() })),
    collectMaterialMapAssetIds: vi.fn(() => []),
    requestAnimationFrame: vi.fn(() => 1),
    cancelAnimationFrame: vi.fn(),
    importRapierPhysics: vi.fn(() =>
      Promise.resolve({
        createPhysicsWorld: vi.fn(() => Promise.resolve({ dispose: vi.fn(), setGravity: vi.fn() })),
      } as never),
    ),
  }
}

describe('createSceneRuntimeSession load path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('completes load path with fake loadWorld and clears bootstrap pending', async () => {
    const host = createHostSpy()
    const handles = createMinimalHandleBag()
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 640, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 480, configurable: true })

    const scene = new THREE.Scene()
    const loadWorld = vi.fn(async () => ({
      scene,
      entities: [],
      world: minimalWorld,
      assetResolver: { dispose: vi.fn() },
      warnings: [] as string[],
    })) as unknown as SceneRuntimeRuntimeDeps['loadWorld']
    const deps = createSessionTestDeps(loadWorld)

    const session = createSceneRuntimeSession(
      {
        world: minimalWorld,
        restartKey: 'k',
        host,
        container,
        handles,
        runPhysics: false,
        runScripts: false,
        shadowsEnabled: true,
      },
      deps,
    )

    session.start()
    expect(host.setSceneBootstrapPending).toHaveBeenCalledWith(true)
    await vi.waitFor(() => {
      expect(host.setScene).toHaveBeenCalledWith(scene)
    })
    expect(deps.warmUpRendererTextures).toHaveBeenCalled()
    expect(host.setSceneBootstrapPending).toHaveBeenLastCalledWith(false)
    session.dispose()
  })

  it('disposes resolver and skips host scene when disposed before loadWorld resolves', async () => {
    const host = createHostSpy()
    const handles = createMinimalHandleBag()
    const container = document.createElement('div')
    const resolverDispose = vi.fn()
    let resolveLoad!: (value: unknown) => void
    const loadWorld = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve
        }),
    )
    const deps = createSessionTestDeps(loadWorld as SceneRuntimeRuntimeDeps['loadWorld'])

    const session = createSceneRuntimeSession(
      {
        world: minimalWorld,
        restartKey: 'k',
        host,
        container,
        handles,
        runPhysics: false,
        runScripts: false,
        shadowsEnabled: true,
      },
      deps,
    )

    session.start()
    session.dispose()
    const loadedScene = new THREE.Scene()
    resolveLoad({
      scene: loadedScene,
      entities: [],
      world: minimalWorld,
      assetResolver: { dispose: resolverDispose },
      warnings: [],
    })
    await Promise.resolve()
    expect(resolverDispose).toHaveBeenCalledTimes(1)
    expect(host.setScene).not.toHaveBeenCalledWith(loadedScene)
  })

  it('drops stale loadWorld result when start() bumps effectId', async () => {
    const host = createHostSpy()
    const handles = createMinimalHandleBag()
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })

    const staleResolverDispose = vi.fn()
    const freshScene = new THREE.Scene()
    let firstResolve!: (value: unknown) => void
    let call = 0
    const loadWorld = vi.fn(
      () =>
        new Promise((resolve) => {
          call += 1
          if (call === 1) firstResolve = resolve
          else {
            resolve({
              scene: freshScene,
              entities: [],
              world: minimalWorld,
              assetResolver: { dispose: vi.fn() },
              warnings: [],
            })
          }
        }),
    )
    const deps = createSessionTestDeps(loadWorld as SceneRuntimeRuntimeDeps['loadWorld'])

    const session = createSceneRuntimeSession(
      {
        world: minimalWorld,
        restartKey: 'k',
        host,
        container,
        handles,
        runPhysics: false,
        runScripts: false,
        shadowsEnabled: true,
      },
      deps,
    )

    session.start()
    session.start()
    firstResolve({
      scene: new THREE.Scene(),
      entities: [],
      world: minimalWorld,
      assetResolver: { dispose: staleResolverDispose },
      warnings: [],
    })
    await vi.waitFor(() => {
      expect(host.setScene).toHaveBeenCalledWith(freshScene)
    })
    expect(staleResolverDispose).toHaveBeenCalledTimes(1)
    session.dispose()
  })
})

describe('disposeSceneRuntimeSession', () => {
  it('matches legacy SceneView cleanup order (physics ref before rAF; registry before dispose)', () => {
    const order: string[] = []
    const host = createHostSpy()
    const handles = createMinimalHandleBag()
    const container = document.createElement('div')
    const canvas = document.createElement('canvas')
    container.appendChild(canvas)
    const rend = new THREE.WebGLRenderer()
    Object.defineProperty(rend, 'domElement', { value: canvas, configurable: true })
    const pwDispose = vi.fn(() => order.push('physics-dispose'))
    handles.physicsRef.current = { dispose: pwDispose } as never
    const registryClear = vi.fn(() => order.push('registry'))
    handles.registryRef.current = { clear: registryClear } as never
    const rendDispose = vi.spyOn(rend, 'dispose').mockImplementation(() => {
      order.push('dom-renderer')
    })

    disposeSceneRuntimeSession({
      config: {
        world: minimalWorld,
        restartKey: 'k',
        host,
        container,
        handles,
        runPhysics: true,
        runScripts: false,
        shadowsEnabled: true,
      },
      host,
      handles,
      deps: {
        ...createSessionTestDeps(vi.fn() as never),
        cancelAnimationFrame: vi.fn(() => {
          order.push('raf')
          expect(handles.physicsRef.current).toBeNull()
        }),
      },
      scriptSnackbarTimer: { id: undefined },
      prefetchDisposer: null,
      gpu: { cam: null, rend, cameraCtrl: null },
      listeners: { ro: null, removeAvatarKeydown: undefined },
      markCancelled: vi.fn(),
    })

    expect(order).toEqual(['raf', 'registry', 'physics-dispose', 'dom-renderer'])
    rendDispose.mockRestore()
  })

  it('saves free-fly camera pose to savedCameraStateRef', () => {
    const host = createHostSpy()
    const handles = createMinimalHandleBag()
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(1, 2, 3)
    cam.quaternion.set(0, 0, 0, 1)
    cam.up.set(0, 1, 0)
    const cameraCtrl = {
      getConfig: () => ({ control: 'free' as const }),
    }

    disposeSceneRuntimeSession({
      config: {
        world: minimalWorld,
        restartKey: 'k',
        host,
        container: document.createElement('div'),
        handles,
        runPhysics: false,
        runScripts: false,
        shadowsEnabled: true,
      },
      host,
      handles,
      deps: createSessionTestDeps(vi.fn() as never),
      scriptSnackbarTimer: { id: undefined },
      prefetchDisposer: null,
      gpu: { cam, rend: null, cameraCtrl: cameraCtrl as never },
      listeners: { ro: null, removeAvatarKeydown: undefined },
      markCancelled: vi.fn(),
    })

    expect(handles.savedCameraStateRef.current?.position.toArray()).toEqual([1, 2, 3])
  })
})

describe('createSceneRuntimeSessionStub', () => {
  it('start toggles bootstrap pending; dispose clears scene graph state', () => {
    const host = createHostSpy()
    const session = createSceneRuntimeSessionStub({
      world: minimalWorld,
      restartKey: 'k',
      host,
      container: document.createElement('div'),
      handles: createMinimalHandleBag(),
      runPhysics: true,
      runScripts: true,
      shadowsEnabled: true,
    })

    session.start()
    expect(host.setSceneBootstrapPending).toHaveBeenCalledWith(true)
    expect(host.setSceneBootstrapPending).toHaveBeenCalledWith(false)

    session.dispose()
    expect(host.setScene).toHaveBeenCalledWith(null)
    expect(host.setCamera).toHaveBeenCalledWith(null)
    expect(host.setRenderer).toHaveBeenCalledWith(null)
    expect(host.resetHud).toHaveBeenCalled()

    session.start()
    expect(host.setSceneBootstrapPending).toHaveBeenCalledTimes(2)
  })
})
