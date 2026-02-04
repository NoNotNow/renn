import * as THREE from 'three'
import { GLTFLoader } from 'three-stdlib'

const DEFAULT_SIZE = 160
const DEFAULT_BG = new THREE.Color(0x1a1a1a)

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose()
    }
  }
  material.dispose()
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) child.geometry.dispose()
      const material = child.material
      if (Array.isArray(material)) {
        material.forEach(disposeMaterial)
      } else if (material) {
        disposeMaterial(material)
      }
    }
  })
}

function frameCamera(camera: THREE.PerspectiveCamera, object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) {
    camera.position.set(2, 2, 2)
    camera.lookAt(0, 0, 0)
    return
  }
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = THREE.MathUtils.degToRad(camera.fov)
  const distance = maxDim / (2 * Math.tan(fov / 2))
  const offset = new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(distance * 1.8)
  camera.position.copy(center).add(offset)
  camera.near = Math.max(distance / 100, 0.01)
  camera.far = distance * 10
  camera.lookAt(center)
  camera.updateProjectionMatrix()
}

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
