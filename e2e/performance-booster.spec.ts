import { test, expect } from '@playwright/test'

test.describe('Performance booster', () => {
  test('opens from Tools menu and shows mesh and texture sections', async ({ page }) => {
    const pageErrors: Error[] = []
    page.on('pageerror', (err) => pageErrors.push(err))

    await page.goto('/')

    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'Performance booster' }).click()

    // Modal header title is outside the `data-testid="performance-booster-dialog"` wrapper.
    const modal = page.getByRole('dialog', { name: /Performance\s*booster/i })
    await expect(modal).toBeVisible({ timeout: 10000 })
    await expect(modal.getByRole('heading', { name: /Performance\s*booster/i })).toBeVisible({ timeout: 10000 })

    const dialog = modal.getByTestId('performance-booster-dialog')
    await expect(dialog.getByText('Meshes', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Textures', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/Lists trimesh bodies and entities with a/)).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('apply mesh is disabled until preview shows reduction', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'Performance booster' }).click()

    const applyMesh = page.getByTestId('performance-booster-apply-mesh')
    await expect(applyMesh).toBeDisabled()
  })

  test('triangle filter input is editable', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'Performance booster' }).click()

    const filter = page.getByTestId('mesh-triangle-filter')
    await filter.fill('8000')
    await expect(filter).toHaveValue('8000')
  })

  test('mesh list shows empty state or GLTF candidates', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'Performance booster' }).click()

    const dialog = page.getByTestId('performance-booster-dialog')
    const empty = dialog.getByText(/No entities above threshold/)
    const listbox = dialog.getByRole('listbox', { name: 'Mesh candidates' })
    const hasCandidates = (await listbox.locator('[role="option"]').count()) > 0

    if (hasCandidates) {
      await expect(empty).not.toBeVisible()
    } else {
      await expect(empty).toBeVisible()
    }
  })
})
