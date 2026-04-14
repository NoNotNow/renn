/**
 * FFmpeg WASM + worker URLs bundled by Vite (`?url`). Served from the app origin (dev + prod),
 * avoiding jsDelivr / toBlobURL timeouts on slow networks.
 */
import coreJs from '@ffmpeg/core?url'
import coreWasm from '@ffmpeg/core/wasm?url'
/** Package does not export `worker.js`; relative path is stable with hoisted `node_modules`. */
import workerJs from '../../node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js?url'

export const ffmpegCoreScriptUrl: string = coreJs
export const ffmpegCoreWasmUrl: string = coreWasm
export const ffmpegWorkerScriptUrl: string = workerJs
