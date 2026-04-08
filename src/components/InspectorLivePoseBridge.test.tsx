import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { InspectorLivePoseBridge, type LivePosesMap } from '@/components/InspectorLivePoseBridge'

describe('InspectorLivePoseBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('polls getPoses on interval and passes map to children', async () => {
    const poseMap: LivePosesMap = new Map([
      [
        'a',
        {
          position: [1, 2, 3],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
      ],
    ])
    const getPoses = vi.fn().mockReturnValue(poseMap)

    render(
      <InspectorLivePoseBridge getPoses={getPoses} intervalMs={100}>
        {(live) => <div data-testid="tick">{live?.get('a')?.position[0] ?? 'none'}</div>}
      </InspectorLivePoseBridge>,
    )

    expect(screen.getByTestId('tick')).toHaveTextContent('none')

    await act(async () => {
      vi.advanceTimersByTime(100)
    })

    expect(getPoses).toHaveBeenCalled()
    expect(screen.getByTestId('tick')).toHaveTextContent('1')
  })
})
