import type { Page } from '@playwright/test'

/**
 * Import a project ZIP via File > Import (hidden file input).
 */
export async function importWorldZip(page: Page, zipPath: string): Promise<void> {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: 'Import' }).click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(zipPath)
}
