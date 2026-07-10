import { test, expect } from '@playwright/test'
import { entityExplorerRows, openEntitiesTab } from './helpers/entityExplorer'

test.describe('Builder add entity', () => {
  test('adds entity when selecting Add box and entity list gains one item without page errors', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')
    await openEntitiesTab(page)
    await expect(page.getByTitle('Add entity')).toBeVisible()

    const entityRows = entityExplorerRows(page)
    const initialCount = await entityRows.count()

    await page.getByTitle('Add entity').selectOption('box')

    await expect(entityRows).toHaveCount(initialCount + 1)
    const addedEntityButton = entityRows.nth(initialCount)
    await expect(addedEntityButton).toBeVisible()
    await expect(addedEntityButton).toHaveText(/^box [a-z]+ \d+$/i)

    expect(pageErrors).toEqual([])
  })

})
