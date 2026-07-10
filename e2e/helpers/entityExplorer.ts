import type { Page } from '@playwright/test'

/** Open the Entities sidebar tab (exact match avoids filter-toggle buttons). */
export async function openEntitiesTab(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Entities', exact: true }).click()
}

/** Entity row buttons in the explorer tree. */
export function entityExplorerRows(page: Page) {
  return page.locator('button[data-entity-row-id]')
}
