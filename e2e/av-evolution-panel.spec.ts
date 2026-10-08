import { test, expect } from '@playwright/test'

test.describe('AV evolution panel', () => {
  test('runs generations in Web Workers, persists to IndexedDB, restores after reload', async ({ page }) => {
    test.setTimeout(240_000)
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (m) => {
      // pre-existing React style warning from EntitySearchPicker (unrelated to this panel)
      if (m.type() === 'error' && !m.text().includes('a style property during rerender')) errors.push(m.text())
    })

    await page.goto('/renn/')
    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'AV evolution' }).click()
    const panel = page.getByTestId('av-evolution-panel')
    await expect(panel).toBeVisible()

    await panel.getByLabel('Population').fill('4')
    await panel.getByLabel('Episodes per candidate').fill('1')
    await panel.getByLabel('Workers').fill('2')
    await panel.getByTestId('av-evo-new').click()

    const status = panel.getByTestId('av-evo-status')
    await expect(status).toContainText(/gen [1-9]/, { timeout: 200_000 })
    const during = await status.innerText()
    console.log('status after >=2 generations:', during)
    await panel.getByTestId('av-evo-stop').click()
    await expect(status).toContainText('idle', { timeout: 30_000 })
    const stopped = await status.innerText()
    console.log('status after stop:', stopped)

    // fitness weights of a UI-started run must be the documented defaults (wReversal 0.5, wReverseS 0), and the compact export is best-first
    const exp = await page.evaluate(async () => {
      const api = window.__rennAvEvolution!
      const id = (await api.list())[0]!.runId
      const x = await api.export(id, { compact: true, topN: 5 })
      return { weights: x.run.weights, compact: x.compact, hasState: !!x.run.state, fits: x.candidates.map((c) => c.fitness), episodes: x.candidates.map((c) => c.episodes.length) }
    })
    expect(exp.weights.wReversal).toBe(0.5)
    expect(exp.weights.wReverseS).toBe(0)
    expect(exp.compact).toBeDefined()
    expect(exp.hasState).toBe(false)
    expect(exp.fits).toEqual([...exp.fits].sort((a, b) => a - b))
    expect(exp.episodes.every((n) => n === 0)).toBe(true)

    const before = await page.evaluate(async () => {
      const api = window.__rennAvEvolution!
      return { runs: await api.list(), best: await api.best({ topN: 3, minEpisodes: 1 }) }
    })
    console.log('before reload', JSON.stringify(before).slice(0, 600))
    expect(before.runs.length).toBeGreaterThan(0)

    await page.reload()
    await page.getByRole('button', { name: 'Tools' }).click()
    await page.getByRole('menuitem', { name: 'AV evolution' }).click()
    const panel2 = page.getByTestId('av-evolution-panel')
    await expect(panel2.getByTestId('av-evo-row').first()).toBeVisible({ timeout: 15_000 })
    const rows = await panel2.getByTestId('av-evo-row').count()
    const after = await page.evaluate(async () => JSON.stringify(await window.__rennAvEvolution!.best({ topN: 3, minEpisodes: 1 })))
    console.log('after reload rows', rows, after.slice(0, 600))
    expect(rows).toBeGreaterThan(0)
    expect(JSON.stringify(before.best)).toBe(after)
    console.log('console/page errors:', JSON.stringify(errors))
    expect(errors).toEqual([])
  })
})
