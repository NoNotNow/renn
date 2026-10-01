#!/usr/bin/env npx tsx
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildShippedGlobalBehaviorLibraryBundle } from '../../src/globalPipeline/buildSelfDrivingGlobalBehaviorLibrary'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const outPath = resolve(root, 'public/global/shipped-global-behavior-library.json')

const bundle = buildShippedGlobalBehaviorLibraryBundle()
writeFileSync(outPath, JSON.stringify(bundle, null, 2) + '\n')
console.log(JSON.stringify({ ok: true, path: outPath, checksum: bundle.checksum }, null, 2))
