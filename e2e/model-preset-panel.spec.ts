import { test, expect } from '@playwright/test'

const PRESET_NAME = 'E2E model preset'

test.describe('Model preset panel (UI)', () => {
  test('save preset from one entity, library updates, apply to another entity updates shape', async ({
    page,
  }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')

    await expect(page.getByRole('button', { name: 'Entities' })).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Entities' }).click()
    await page.getByRole('button', { name: 'Player Car' }).click()

    await page.getByRole('button', { name: 'Presets' }).click()

    await expect(page.getByText('No presets yet.')).toBeVisible()

    await page.getByPlaceholder('e.g. Red crate').fill(PRESET_NAME)
    await page.getByRole('button', { name: 'Save preset' }).click()

    await expect(page.getByText('No presets yet.')).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Library' })).toBeVisible()
    const presetCard = page.getByRole('listitem').filter({ hasText: PRESET_NAME })
    await expect(presetCard).toBeVisible()
    await expect(presetCard).toContainText(/box ·/)

    await page.getByPlaceholder('e.g. Red crate').fill('')
    await expect(page.getByRole('button', { name: 'Save preset' })).toBeDisabled()

    await page.getByRole('button', { name: 'Entities' }).click()
    await page.getByRole('button', { name: 'Ground' }).click()

    await page.getByRole('button', { name: 'Presets' }).click()
    await page.getByRole('button', { name: 'Apply' }).click()

    await page.getByRole('button', { name: 'Properties' }).click()
    await expect(page.locator('#ground-shape')).toHaveValue('box')

    expect(pageErrors).toEqual([])
  })
})
