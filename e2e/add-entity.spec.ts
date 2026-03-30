import { test, expect } from '@playwright/test'

test.describe('Builder add entity', () => {
  test('adds entity when selecting Add box and entity list gains one item without page errors', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')
    await page.getByRole('button', { name: 'entities' }).click()
    await expect(page.getByTitle('Add entity')).toBeVisible()

    const entityList = page.getByRole('list')
    const initialCount = await entityList.locator('li').count()

    await page.getByTitle('Add entity').selectOption('box')

    await expect(entityList.locator('li')).toHaveCount(initialCount + 1)
    // The default world may already contain many "box <color> <n>" entities.
    // Instead of a strict-mode ambiguous role query, assert on the newly-added list item.
    const addedEntityButton = entityList.locator('li').nth(initialCount).getByRole('button')
    await expect(addedEntityButton).toBeVisible()
    await expect(addedEntityButton).toHaveText(/^box [a-z]+ \d+$/i)

    expect(pageErrors).toEqual([])
  })

})
