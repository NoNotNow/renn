import { test, expect } from '@playwright/test'
import { entityExplorerRows, openEntitiesTab } from './helpers/entityExplorer'

test.describe('Builder multi-select', () => {
  test('Shift+click second entity in list shows multi-selection in properties', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')
    await openEntitiesTab(page)

    const entityRows = entityExplorerRows(page)
    await expect(entityRows.first()).toBeVisible()
    const count = await entityRows.count()
    test.skip(count < 2, 'Need at least two entities in default world')

    await entityRows.nth(0).click()
    await entityRows.nth(1).click({ modifiers: ['Shift'] })

    await page.getByRole('button', { name: 'Properties', exact: true }).click()
    await expect(page.getByText(/Multiple entities \(\d+\)/)).toBeVisible()

    expect(pageErrors).toEqual([])
  })
})
