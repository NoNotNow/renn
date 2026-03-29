/**
 * Builds e2e/fixtures/giraffe-world.zip from giraffe-world.json + giraffe.glb.
 * Run: npm run test:build-fixtures
 *
 * Prerequisite: place giraffe.glb in e2e/fixtures/ (user-provided asset).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '../fixtures')
const worldJsonPath = path.join(fixturesDir, 'giraffe-world.json')
const glbPath = path.join(fixturesDir, 'giraffe.glb')
const outZipPath = path.join(fixturesDir, 'giraffe-world.zip')

async function main(): Promise<void> {
  if (!fs.existsSync(glbPath)) {
    console.error(
      `[buildGiraffeFixture] Missing ${glbPath}\n` +
        'Add giraffe.glb to e2e/fixtures/ then run npm run test:build-fixtures again.',
    )
    process.exit(1)
  }
  if (!fs.existsSync(worldJsonPath)) {
    console.error(`[buildGiraffeFixture] Missing ${worldJsonPath}`)
    process.exit(1)
  }

  const worldJson = fs.readFileSync(worldJsonPath, 'utf8')
  const glbBuffer = fs.readFileSync(glbPath)

  const zip = new JSZip()
  zip.file('world.json', worldJson)
  zip.folder('assets')!.file('giraffe-test-asset.glb', glbBuffer)

  const blob = await zip.generateAsync({ type: 'nodebuffer' })
  fs.writeFileSync(outZipPath, blob)
  console.log(`[buildGiraffeFixture] Wrote ${outZipPath} (${blob.length} bytes)`)
}

void main()
