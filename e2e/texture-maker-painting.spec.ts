import { test, expect } from '@playwright/test'
import path from 'node:path'

const textureFixture = path.join(process.cwd(), 'e2e/fixtures/brush-1x1.png')

async function readPreviewPixel(page: import('@playwright/test').Page): Promise<[number, number, number, number]> {
  return await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="texture-maker-preview-canvas"]')
    if (!canvas) throw new Error('Missing texture-maker-preview-canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Missing 2d context')
    const w = canvas.width
    const h = canvas.height
    const x = Math.floor(w / 2)
    const y = Math.floor(h / 2)
    const data = ctx.getImageData(x, y, 1, 1).data
    return [data[0]!, data[1]!, data[2]!, data[3]!]
  })
}

test.describe('Texture Maker painting (E2E)', () => {
  test('paints preview pixels and persists after Apply', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')

    // Add a new box entity.
    await page.getByRole('button', { name: /entities/i }).click()
    await expect(page.getByTitle('Add entity')).toBeVisible({ timeout: 30_000 })
    const entityList = page.getByRole('list')
    const initialCount = await entityList.locator('li').count()
    await page.getByTitle('Add entity').selectOption('box')
    const addedEntityButton = entityList.locator('li').nth(initialCount).getByRole('button')
    await addedEntityButton.click()

    // Upload a tiny texture so the entity has a composited map we can edit.
    await page.getByRole('button', { name: 'Properties' }).click()
    await page.getByRole('button', { name: 'Add texture' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('input[type="file"]').setInputFiles(textureFixture)
    await dialog.getByRole('button', { name: 'Confirm' }).click()
    await expect(dialog).not.toBeVisible()

    // Set brush color to a known value.
    await page.getByRole('button', { name: 'Brush tool' }).click()
    const colorInput = page.getByTestId('texture-brush-color')
    await expect(colorInput).toBeVisible()
    await colorInput.fill('#ff00ff')

    // Open Texture Maker.
    await page.getByTestId('material-open-texture-maker').click()
    const panel = page.getByTestId('texture-maker-panel')
    await expect(panel).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('texture-maker-preview-canvas')).toBeVisible()

    await page.getByTestId('texture-maker-tool-brush').click()

    const before = await readPreviewPixel(page)

    const stack = page.getByTestId('texture-maker-preview-stack')
    const box = await stack.boundingBox()
    if (!box) throw new Error('Missing preview stack bounding box')

    const x = box.x + box.width / 2
    const y = box.y + box.height / 2

    // Dispatch pointer events: pointerdown on stack (React handler).
    // IMPORTANT: `TextureMaker` initializes `paintStrokeRef` asynchronously on pointerdown, so we wait for the
    // preview pixel to change before dispatching pointerup (stroke end + PNG export).
    await page.evaluate(
      ({ x, y }) => {
        const el = document.querySelector<HTMLElement>('[data-testid="texture-maker-preview-stack"]')
        if (!el) throw new Error('Missing preview stack element')
        const pid = 1
        el.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, pointerId: pid, bubbles: true }))
      },
      { x, y },
    )

    // Wait until the preview pixel becomes "magenta-like" (and non-transparent).
    await expect
      .poll(async () => {
        const [r, g, b, a] = await readPreviewPixel(page)
        return r > 150 && b > 150 && g < 120 && a > 0
      })
      .toBe(true, { timeout: 15_000 })

    const afterPaint = await readPreviewPixel(page)
    expect(afterPaint).not.toEqual(before)

    // Now end the stroke so Apply persists the encoded working canvas changes.
    await page.evaluate(
      ({ x, y }) => {
        const pid = 1
        const el = document.querySelector<HTMLElement>('[data-testid="texture-maker-preview-stack"]')
        if (!el) throw new Error('Missing preview stack element')
        el.dispatchEvent(new PointerEvent('pointerup', { clientX: x + 1, clientY: y + 1, pointerId: pid, bubbles: true }))
      },
      { x, y },
    )

    // Wait for async stroke-end work (PNG encode + draft asset update) before clicking Apply.
    await page.waitForTimeout(300)

    // Apply the changes to the entity, which closes Texture Maker.
    await page.getByTestId('texture-maker-apply-final').click()
    await expect(panel).toBeHidden({ timeout: 30_000 })

    // Reopen Texture Maker and verify the paint persisted.
    await page.getByTestId('material-open-texture-maker').click()
    await expect(page.getByTestId('texture-maker-panel')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('texture-maker-preview-canvas')).toBeVisible()

    const afterApply = await readPreviewPixel(page)

    const isMagentaLike = ([r, g, b, a]: [number, number, number, number]): boolean =>
      a > 0 && r > 150 && b > 150 && g < 200

    // Persistence: pixel should remain painted (not transparent / not pre-paint), even after Apply.
    const pixMsg = `before=${before.join(',')} afterPaint=${afterPaint.join(',')} afterApply=${afterApply.join(',')}`
    expect(isMagentaLike(afterApply), pixMsg).toBe(true)
    expect(afterApply).not.toEqual(before)

    expect(pageErrors).toEqual([])
  })
})

