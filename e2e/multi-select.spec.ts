import { test, expect } from '@playwright/test'

test.describe('Builder multi-select', () => {
  test('Shift+click second entity in list shows multi-selection in properties', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')
    await page.getByRole('button', { name: /entities/i }).click()

    const list = page.getByRole('list')
    const rowButtons = list.locator('li button')
    await expect(rowButtons.first()).toBeVisible()
    const count = await rowButtons.count()
    test.skip(count < 2, 'Need at least two entities in default world')

    await rowButtons.nth(0).click()
    await rowButtons.nth(1).click({ modifiers: ['Shift'] })

    await page.getByRole('button', { name: /properties/i }).click()
    await expect(page.getByText(/Multiple entities \(\d+\)/)).toBeVisible()

    expect(pageErrors).toEqual([])
  })
})
