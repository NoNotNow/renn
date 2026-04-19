import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useRef } from 'react'
import { LivePosesPoll, type LivePosesMap } from './LivePosesPoll'

function TestHost({ poses }: { poses: LivePosesMap | null }) {
  const ref = useRef<() => LivePosesMap | null>(() => null)
  ref.current = () => poses
  return (
    <LivePosesPoll getPosesRef={ref} intervalMs={50}>
      {(live) => <div data-testid="poses">{live?.size ?? 0}</div>}
    </LivePosesPoll>
  )
}

describe('LivePosesPoll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('updates child after tick when poses are non-empty', async () => {
    const map: LivePosesMap = new Map([
      ['a', { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
    ])

    render(<TestHost poses={map} />)

    expect(screen.getByTestId('poses')).toHaveTextContent('0')

    await act(async () => {
      vi.advanceTimersByTime(50)
    })

    expect(screen.getByTestId('poses')).toHaveTextContent('1')
  })
})
