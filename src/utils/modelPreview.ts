import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'
import { convertZUpToYUpIfNeeded } from '@/utils/normalizeModelToUnitCube'
import { resolvedLogarithmicDepthBuffer } from '@/types/world'
import { disposeObject, frameCamera } from '@/utils/modelPreviewFraming'

const DEFAULT_SIZE = 160
const DEFAULT_BG = new THREE.Color(0x1a1a1a)

async function loadModelScene(blob: Blob): Promise<THREE.Object3D | null> {
  const url = URL.createObjectURL(blob)
  const loader = new GLTFLoader()
  try {
    const gltf = await loader.loadAsync(url)
    return gltf.scene
  } catch (error) {
    console.error('Failed to load model for preview:', error)
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function generateModelPreview(
  blob: Blob,
  size: number = DEFAULT_SIZE,
  backgroundColor: THREE.Color = DEFAULT_BG
): Promise<Blob | null> {
  const scene = new THREE.Scene()
  scene.background = backgroundColor

  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: resolvedLogarithmicDepthBuffer(undefined),
    preserveDrawingBuffer: true,
  })
  renderer.setSize(size, size, false)
  renderer.setPixelRatio(1)

  const ambient = new THREE.AmbientLight(0xffffff, 0.8)
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.8)
  keyLight.position.set(4, 6, 4)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.4)
  fillLight.position.set(-4, 2, -2)
  scene.add(ambient, keyLight, fillLight)

  let modelScene: THREE.Object3D | null = null
  try {
    modelScene = await loadModelScene(blob)
    if (!modelScene) return null
    convertZUpToYUpIfNeeded(modelScene)
    scene.add(modelScene)
    frameCamera(camera, modelScene)
    renderer.render(scene, camera)

    const canvas = renderer.domElement
    const previewBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png')
    })
    return previewBlob
  } finally {
    if (modelScene) {
      disposeObject(modelScene)
      scene.remove(modelScene)
    }
    renderer.dispose()
  }
}
