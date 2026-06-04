import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import { highlightJsCode } from './highlightJsCode'

describe('highlightJsCode', () => {
  it('preserves whitespace between tokens', () => {
    const code = `const throttle = api.getAction(input, 'throttle');
input.actions.steer_left = 1;`
    const { container } = render(<span>{highlightJsCode(code)}</span>)
    expect(container.textContent).toBe(code)
  })

  it('renders tokens without throwing for typical transformer snippets', () => {
    const code = `const hit = api.raycastSpread(front, forward, 20, 2, 5, {
  visualize: true,
});`
    const { container } = render(<span>{highlightJsCode(code)}</span>)
    expect(container.textContent).toBe(code)
    expect(container.querySelectorAll('span').length).toBeGreaterThan(5)
  })
})
