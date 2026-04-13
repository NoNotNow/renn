/**
 * Browser-only video transcode via ffmpeg.wasm (lazy-loaded).
 * Serialized queue: one conversion at a time to avoid overlapping FFmpeg state.
 */
import type { FFmpeg } from '@ffmpeg/ffmpeg'

const CORE_VERSION = '0.12.10'
const FFMPEG_PACKAGE_VERSION = '0.12.10'
const CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/esm`
/** Must match installed `@ffmpeg/ffmpeg` — Vite does not ship `worker.js` next to the prebundled entry, so we load this explicitly. */
const FFMPEG_WORKER_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@${FFMPEG_PACKAGE_VERSION}/dist/esm`

let loadPromise: Promise<FFmpeg> | null = null
let ffmpegSingleton: FFmpeg | null = null
let queue: Promise<void> = Promise.resolve()

function extensionFromFilename(name: string): string {
  const m = name.match(/\.([^.]+)$/)
  return m ? m[1]!.toLowerCase() : 'bin'
}

async function getFFmpegLoaded(): Promise<FFmpeg> {
  if (typeof window === 'undefined') {
    throw new Error('Video conversion is only available in the browser.')
  }
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const [{ FFmpeg: FFmpegCtor }, { toBlobURL }] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('@ffmpeg/util'),
    ])
    const ffmpeg = new FFmpegCtor()
    await ffmpeg.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      classWorkerURL: await toBlobURL(`${FFMPEG_WORKER_BASE}/worker.js`, 'text/javascript'),
    })
    ffmpegSingleton = ffmpeg
    return ffmpeg
  })()

  return loadPromise
}

function killFfmpeg(): void {
  try {
    ffmpegSingleton?.terminate()
  } catch {
    /* ignore */
  }
  ffmpegSingleton = null
  loadPromise = null
}

export function resetFfmpegForTests(): void {
  killFfmpeg()
  queue = Promise.resolve()
}

/**
 * Transcode to H.264 + AAC MP4, max 1280×720 (preserving aspect ratio).
 */
export async function convertVideoToWebMp4(
  file: File,
  options?: {
    onProgress?: (ratio: number) => void
    signal?: AbortSignal
  },
): Promise<Blob> {
  if (options?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const run = async (): Promise<Blob> => {
    const ffmpeg = await getFFmpegLoaded()
    const onProgress = options?.onProgress
    const signal = options?.signal

    const progressHandler = onProgress
      ? ({ progress }: { progress: number }): void => {
          onProgress(Math.min(1, Math.max(0, progress)))
        }
      : null
    if (progressHandler) {
      ffmpeg.on('progress', progressHandler)
    }

    const ext = extensionFromFilename(file.name)
    const inName = `input.${ext}`
    const outName = 'output.mp4'

    const { fetchFile } = await import('@ffmpeg/util')

    try {
      await ffmpeg.writeFile(inName, await fetchFile(file))
      const args = [
        '-i',
        inName,
        '-vf',
        "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease",
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outName,
      ]
      const code = await ffmpeg.exec(args, undefined, signal ? { signal } : undefined)
      if (code !== 0) {
        throw new Error(`ffmpeg exited with code ${code}`)
      }
      const data = await ffmpeg.readFile(outName)
      if (!(data instanceof Uint8Array)) {
        throw new Error('Expected binary MP4 output from ffmpeg')
      }
      return new Blob([data], { type: 'video/mp4' })
    } catch (err) {
      if (
        signal?.aborted ||
        (err instanceof DOMException && err.name === 'AbortError')
      ) {
        killFfmpeg()
      }
      throw err
    } finally {
      if (progressHandler) {
        ffmpeg.off('progress', progressHandler)
      }
      await ffmpeg.deleteFile(inName).catch(() => {})
      await ffmpeg.deleteFile(outName).catch(() => {})
    }
  }

  const job = queue.then(run)
  queue = job.then(() => {}).catch(() => {})
  return job
}
