import { test, expect } from '@playwright/test'
import path from 'node:path'

const textureFixture = path.join(process.cwd(), 'e2e/fixtures/brush-1x1.png')

test.describe('Texture brush color (Builder)', () => {
  test('brush color control appears after enabling paint on a textured entity; changing color updates the input', async ({
    page,
  }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')

    await page.getByRole('button', { name: /entities/i }).click()
    await expect(page.getByTitle('Add entity')).toBeVisible({ timeout: 30_000 })

    const entityList = page.getByRole('list')
    const initialCount = await entityList.locator('li').count()
    await page.getByTitle('Add entity').selectOption('box')
    await expect(entityList.locator('li')).toHaveCount(initialCount + 1)

    const newBoxButton = entityList.locator('li').nth(initialCount).getByRole('button')
    await newBoxButton.click()

    await page.getByRole('button', { name: 'Properties' }).click()
    await page.getByRole('button', { name: 'Add texture' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('input[type="file"]').setInputFiles(textureFixture)
    await dialog.getByRole('button', { name: 'Confirm' }).click()
    await expect(dialog).not.toBeVisible()

    await page.getByRole('button', { name: 'Brush tool' }).click()

    const colorInput = page.getByTestId('texture-brush-color')
    await expect(colorInput).toBeVisible()
    const before = await colorInput.inputValue()

    await colorInput.fill('#ff00ff')
    const after = await colorInput.inputValue()
    expect(after).toMatch(/^#?ff00ff$/i)
    expect(after.toLowerCase()).not.toBe(before.toLowerCase())

    expect(pageErrors).toEqual([])
  })
})
