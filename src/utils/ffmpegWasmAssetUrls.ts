/**
 * FFmpeg WASM + worker URLs from the app origin (dev + prod), avoiding jsDelivr / toBlobURL.
 * Core uses Vite `?url`; the package worker uses `?worker&url` so Rollup bundles `./errors.js` / `./const.js`
 * (static hosting with `base` would otherwise 404 on e.g. `/assets/errors.js`).
 */
import coreJs from '@ffmpeg/core?url'
import coreWasm from '@ffmpeg/core/wasm?url'
/** Package does not export `worker.js`; `?worker&url` bundles sibling imports (`errors.js`, `const.js`) for production base paths. */
import workerJs from '../../node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js?worker&url'

export const ffmpegCoreScriptUrl: string = coreJs
export const ffmpegCoreWasmUrl: string = coreWasm
export const ffmpegWorkerScriptUrl: string = workerJs
