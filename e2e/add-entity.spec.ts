import { test, expect } from '@playwright/test'

test.describe('Builder add entity', () => {
  test('adds entity when selecting Add box and entity list gains one item without page errors', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')
    await expect(page.getByTitle('Add entity')).toBeVisible()

    const entityList = page.getByRole('list')
    const initialCount = await entityList.locator('li').count()

    await page.getByTitle('Add entity').selectOption('box')

    await expect(entityList.locator('li')).toHaveCount(initialCount + 1)
    await expect(page.getByRole('button', { name: /^entity_\d+$/ })).toBeVisible()

    expect(pageErrors).toEqual([])
  })
})
