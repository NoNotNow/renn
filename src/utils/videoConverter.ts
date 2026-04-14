/**
 * Browser-only video transcode via ffmpeg.wasm (lazy-loaded).
 * Serialized queue: one conversion at a time to avoid overlapping FFmpeg state.
 */
import type { FFmpeg } from '@ffmpeg/ffmpeg'

/**
 * First WASM load compiles a large module (can be slow on weak devices). Assets are bundled
 * via {@link ./ffmpegWasmAssetUrls.ts} (same-origin), not a CDN.
 */
const FFMPEG_LOAD_TIMEOUT_MS = 300_000

/**
 * FFmpeg.wasm often does not emit `progress` during libx264 encode (single-thread core).
 * We reserve [0, ENCODE_PROGRESS_START) for load, then map reported 0–1 into
 * [ENCODE_PROGRESS_START, ENCODE_PROGRESS_START + ENCODE_PROGRESS_SPAN], then jump to 1 when done.
 */
const ENCODE_PROGRESS_START = 0.08
const ENCODE_PROGRESS_SPAN = 0.87

/** Maps ffmpeg-reported ratio (often 0 until the end) into the dialog progress bar mid-range. */
export function encodeProgressFromFfmpegRatio(reported: number): number {
  const t = Math.min(1, Math.max(0, reported))
  return ENCODE_PROGRESS_START + t * ENCODE_PROGRESS_SPAN
}

let loadPromise: Promise<FFmpeg> | null = null
let ffmpegSingleton: FFmpeg | null = null
let queue: Promise<void> = Promise.resolve()

function extensionFromFilename(name: string): string {
  const m = name.match(/\.([^.]+)$/)
  return m ? m[1]!.toLowerCase() : 'bin'
}

function wrapLoadError(step: string, err: unknown): Error {
  const base = err instanceof Error ? err.message : String(err)
  return new Error(`FFmpeg load failed at "${step}": ${base}`)
}

function loadWithTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

export type EncoderLoadState = 'downloading' | 'ready'

type LoadFfmpegOptions = {
  signal?: AbortSignal
  onEncoderLoadState?: (state: EncoderLoadState) => void
}

async function getFFmpegLoaded(opts?: LoadFfmpegOptions): Promise<FFmpeg> {
  if (typeof window === 'undefined') {
    throw new Error('Video conversion is only available in the browser.')
  }

  if (loadPromise) {
    const ff = await loadPromise
    opts?.onEncoderLoadState?.('ready')
    return ff
  }

  loadPromise = (async () => {
    let step = 'dynamic import @ffmpeg packages'
    try {
      opts?.onEncoderLoadState?.('downloading')

      const loadInner = async (): Promise<FFmpeg> => {
        const { FFmpeg: FFmpegCtor } = await import('@ffmpeg/ffmpeg')
        const { ffmpegCoreScriptUrl, ffmpegCoreWasmUrl, ffmpegWorkerScriptUrl } = await import(
          './ffmpegWasmAssetUrls',
        )
        step = 'instantiate FFmpeg'
        const ffmpeg = new FFmpegCtor()

        const coreURL = ffmpegCoreScriptUrl
        const wasmURL = ffmpegCoreWasmUrl
        const classWorkerURL = ffmpegWorkerScriptUrl
        console.warn(
          '[videoConverter] Loading bundled FFmpeg assets (same origin; ~31MB wasm — first visit may take a while)…',
        )

        step = 'ffmpeg.load() initialize wasm'
        await ffmpeg.load(
          { coreURL, wasmURL, classWorkerURL },
          { signal: opts?.signal },
        )
        console.warn('[videoConverter] ffmpeg.load() complete (WASM initialized)')

        ffmpegSingleton = ffmpeg
        return ffmpeg
      }

      const ffmpeg = await loadWithTimeout(
        loadInner(),
        FFMPEG_LOAD_TIMEOUT_MS,
        `FFmpeg encoder load timed out after ${FFMPEG_LOAD_TIMEOUT_MS / 1000}s (WASM compile / load). Try closing other tabs or a faster machine.`,
      )

      opts?.onEncoderLoadState?.('ready')
      return ffmpeg
    } catch (err) {
      killFfmpeg()
      if (opts?.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        throw err
      }
      throw wrapLoadError(step, err)
    }
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
 * Transcode to H.264 MP4 (video only, no audio), max 1280×720 (preserving aspect ratio).
 */
export async function convertVideoToWebMp4(
  file: File,
  options?: {
    onProgress?: (ratio: number) => void
    onEncoderLoadState?: (state: EncoderLoadState) => void
    signal?: AbortSignal
  },
): Promise<Blob> {
  if (options?.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const run = async (): Promise<Blob> => {
    const ffmpeg = await getFFmpegLoaded({
      signal: options?.signal,
      onEncoderLoadState: options?.onEncoderLoadState,
    })
    const onProgress = options?.onProgress
    const signal = options?.signal

    /** Map wasm progress (often sparse or missing for libx264) into a visible range. */
    const progressHandler = onProgress
      ? ({ progress: p }: { progress: number }): void => {
          onProgress(encodeProgressFromFfmpegRatio(p))
        }
      : null
    if (progressHandler) {
      ffmpeg.on('progress', progressHandler)
    }

    const ext = extensionFromFilename(file.name)
    const inName = `input.${ext}`
    const outName = 'output.mp4'

    const { fetchFile } = await import('@ffmpeg/util')

    const logLines: string[] = []
    const logHandler = (entry: { message?: string } | string): void => {
      const line = typeof entry === 'string' ? entry : (entry?.message ?? '')
      if (!line.trim()) return
      logLines.push(line.trimEnd())
      if (logLines.length > 40) logLines.shift()
    }

    try {
      await ffmpeg.writeFile(inName, await fetchFile(file))
      /** FFmpeg.wasm often emits no `progress` during encode; nudge UI so the bar is not stuck at 0%. */
      onProgress?.(ENCODE_PROGRESS_START)
      ffmpeg.on('log', logHandler)
      /**
       * Video-only output: `-c:a aac` fails with exit 1 when the source has **no audio stream**
       * (common). Material maps are muted `VideoTexture` anyway; `-an` avoids that class of failure.
       */
      const args = [
        '-i',
        inName,
        '-vf',
        "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        outName,
      ]
      console.warn('[videoConverter] ffmpeg.exec starting (encode may take a while; progress events are often sparse)…')
      const code = await ffmpeg.exec(args, undefined, signal ? { signal } : undefined)
      console.warn(`[videoConverter] ffmpeg.exec finished (exit code ${code})`)
      if (code !== 0) {
        const tail = logLines.length ? `\n${logLines.slice(-12).join('\n')}` : ''
        throw new Error(`ffmpeg exited with code ${code}.${tail}`)
      }
      const data = await ffmpeg.readFile(outName)
      if (!(data instanceof Uint8Array)) {
        throw new Error('Expected binary MP4 output from ffmpeg')
      }
      onProgress?.(1)
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
      ffmpeg.off('log', logHandler)
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
