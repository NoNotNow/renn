import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { importWorldZip } from './helpers/importWorld'

const zipPath = path.join(process.cwd(), 'e2e/fixtures/giraffe-world.zip')
const fixtureReady = fs.existsSync(zipPath)

async function openEntitiesTab(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'entities' }).click()
}

async function openPerformanceBooster(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Tools' }).click()
  await page.getByRole('menuitem', { name: 'Performance booster' }).click()
}

test.describe('Performance booster — giraffe GLB fixture', () => {
  test.skip(!fixtureReady, 'Missing e2e/fixtures/giraffe-world.zip — add giraffe.glb and run npm run test:build-fixtures')

  test.use({
    permissions: ['clipboard-read', 'clipboard-write'],
  })

  test('after import, Giraffe appears as mesh candidate with triangle count', async ({ page }) => {
    await page.goto('/')
    await importWorldZip(page, zipPath)

    await openEntitiesTab(page)
    await expect(page.getByRole('button', { name: 'Giraffe' })).toBeVisible({ timeout: 120_000 })

    await openPerformanceBooster(page)
    const dialog = page.getByTestId('performance-booster-dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByTestId('mesh-triangle-filter').fill('500')
    await expect(dialog.getByTestId('mesh-triangle-filter')).toHaveValue('500')

    const giraffeTile = dialog.getByRole('option', { name: /Giraffe/i })
    await expect(giraffeTile).toBeVisible({ timeout: 60_000 })
    await expect(giraffeTile).toContainText(/tris/)
  })

  test('Apply mesh is disabled until candidate selected; enabled after preview loads', async ({ page }) => {
    await page.goto('/')
    await importWorldZip(page, zipPath)
    await openEntitiesTab(page)
    await expect(page.getByRole('button', { name: 'Giraffe' })).toBeVisible({ timeout: 120_000 })

    await openPerformanceBooster(page)
    const dialog = page.getByTestId('performance-booster-dialog')
    const applyMesh = dialog.getByTestId('performance-booster-apply-mesh')
    await expect(applyMesh).toBeDisabled()

    await dialog.getByTestId('mesh-triangle-filter').fill('500')
    await dialog.getByRole('option', { name: /Giraffe/i }).click()

    await expect(dialog.getByText(/\d+\s*→\s*\d+\s*triangles/)).toBeVisible({ timeout: 60_000 })
    await expect(applyMesh).toBeEnabled()
  })

  test('preview shows triangle reduction (Y < X) at 50% target ratio', async ({ page }) => {
    await page.goto('/')
    await importWorldZip(page, zipPath)
    await openEntitiesTab(page)
    await expect(page.getByRole('button', { name: 'Giraffe' })).toBeVisible({ timeout: 120_000 })

    await openPerformanceBooster(page)
    const dialog = page.getByTestId('performance-booster-dialog')
    await dialog.getByTestId('mesh-triangle-filter').fill('500')
    await dialog.getByRole('option', { name: /Giraffe/i }).click()

    const previewLoc = dialog.getByTestId('performance-booster-mesh-preview')
    await expect(previewLoc).toBeVisible({ timeout: 60_000 })
    const text = await previewLoc.textContent()
    const m = text?.match(/(\d+)\s*→\s*(\d+)\s*triangles/)
    expect(m, `preview text: ${text}`).toBeTruthy()
    const orig = Number(m![1]!.replace(/,/g, ''))
    const simp = Number(m![2]!.replace(/,/g, ''))
    expect(orig).toBeGreaterThan(500)
    expect(simp).toBeLessThan(orig)
  })

  test('Apply bakes simplified GLB into assets; shape.simplification cleared in JSON; clipboard; UI log', async ({
    page,
  }) => {
    const consoleLines: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'log') consoleLines.push(msg.text())
    })

    await page.goto('/')
    await importWorldZip(page, zipPath)
    await openEntitiesTab(page)
    await expect(page.getByRole('button', { name: 'Giraffe' })).toBeVisible({ timeout: 120_000 })

    await openPerformanceBooster(page)
    const dialog = page.getByTestId('performance-booster-dialog')
    await dialog.getByTestId('mesh-triangle-filter').fill('500')
    await dialog.getByRole('option', { name: /Giraffe/i }).click()
    await expect(dialog.getByText(/\d+\s*→\s*\d+\s*triangles/)).toBeVisible({ timeout: 60_000 })

    await dialog.getByTestId('performance-booster-apply-mesh').click()

    await expect
      .poll(
        () =>
          consoleLines.some(
            (l) =>
              l.includes('[UI CHANGE]') &&
              l.includes('PerformanceBooster') &&
              l.includes('Apply mesh simplification') &&
              l.includes('giraffe'),
          ),
        { timeout: 120_000 },
      )
      .toBe(true)

    await page.getByRole('button', { name: 'File' }).click()
    await page.getByRole('menuitem', { name: 'Copy to Clipboard' }).click()
    const jsonText = await page.evaluate(async () => navigator.clipboard.readText())
    const world = JSON.parse(jsonText) as {
      entities: Array<{
        id: string
        position?: number[]
        shape?: { type?: string; simplification?: { maxTriangles?: number; enabled?: boolean } }
      }>
    }
    const giraffe = world.entities.find((e) => e.id === 'giraffe')
    expect(giraffe).toBeDefined()
    expect(giraffe!.position).toEqual([0, 1, 0])
    expect(giraffe!.shape?.type).toBe('trimesh')
    // Simplification is baked into the model asset; the world document no longer carries simplification flags.
    expect(giraffe!.shape?.simplification).toBeUndefined()
    expect(giraffe!.shape?.model).toBeDefined()
  })

  test('triangle count on candidate tile drops after Apply (rescanned)', async ({ page }) => {
    await page.goto('/')
    await importWorldZip(page, zipPath)
    await openEntitiesTab(page)
    await expect(page.getByRole('button', { name: 'Giraffe' })).toBeVisible({ timeout: 120_000 })

    await openPerformanceBooster(page)
    const dialog = page.getByTestId('performance-booster-dialog')
    await dialog.getByTestId('mesh-triangle-filter').fill('500')

    const tile = dialog.getByRole('option', { name: /Giraffe/i })
    await expect(tile).toBeVisible({ timeout: 60_000 })
    const beforeText = await tile.textContent()
    const beforeMatch = beforeText?.match(/([\d,]+)\s*tris/)
    expect(beforeMatch).toBeTruthy()
    const beforeTri = Number(beforeMatch![1]!.replace(/,/g, ''))

    await tile.click()
    await expect(dialog.getByText(/\d+\s*→\s*\d+\s*triangles/)).toBeVisible({ timeout: 60_000 })
    await dialog.getByTestId('performance-booster-apply-mesh').click()

    await expect
      .poll(
        async () => {
          const t = await tile.textContent()
          const mm = t?.match(/([\d,]+)\s*tris/)
          return mm ? Number(mm[1]!.replace(/,/g, '')) : 0
        },
        { timeout: 60_000 },
      )
      .toBeLessThan(beforeTri)
  })

  test('both meshoptimizer and simplifyModifier previews show reduction', async ({ page }) => {
    await page.goto('/')
    await importWorldZip(page, zipPath)
    await openEntitiesTab(page)
    await expect(page.getByRole('button', { name: 'Giraffe' })).toBeVisible({ timeout: 120_000 })

    await openPerformanceBooster(page)
    const dialog = page.getByTestId('performance-booster-dialog')
    await dialog.getByTestId('mesh-triangle-filter').fill('500')
    await dialog.getByRole('option', { name: /Giraffe/i }).click()
    await expect(dialog.getByText(/\d+\s*→\s*\d+\s*triangles/)).toBeVisible({ timeout: 60_000 })

    const readPreview = async (): Promise<{ orig: number; simp: number }> => {
      const text = await dialog.getByTestId('performance-booster-mesh-preview').textContent()
      const m = text?.match(/(\d+)\s*→\s*(\d+)\s*triangles/)
      expect(m, text).toBeTruthy()
      return {
        orig: Number(m![1]!.replace(/,/g, '')),
        simp: Number(m![2]!.replace(/,/g, '')),
      }
    }

    const meshopt = await readPreview()
    expect(meshopt.simp).toBeLessThan(meshopt.orig)

    await dialog.locator('select').first().selectOption('simplifyModifier')
    await expect
      .poll(async () => {
        const p = await readPreview()
        return p.simp < p.orig
      }, { timeout: 30_000 })
      .toBe(true)
  })
})
