import { useState } from 'react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VectorField from '@/components/form/VectorField'
import PropertyPanel from '@/components/PropertyPanel'
import { createDefaultEntity } from '@/data/entityDefaults'
import type { RennWorld } from '@/types/world'

vi.mock('@/utils/uiLogger', () => ({
  uiLogger: { change: vi.fn(), delete: vi.fn(), click: vi.fn(), log: vi.fn(), select: vi.fn(), upload: vi.fn() },
}))

beforeAll(() => {
  if (!HTMLElement.prototype.setPointerCapture) {
    HTMLElement.prototype.setPointerCapture = vi.fn()
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    HTMLElement.prototype.releasePointerCapture = vi.fn()
  }
})

function ControlledVectorField(props: {
  initial: number[]
  label?: string
  defaultLinked?: boolean
  defaultMode?: 'absolute' | 'relative'
  axisLabels?: [string, string, string]
  min?: number
}) {
  const [value, setValue] = useState(props.initial)
  return (
    <div>
      <VectorField
        label={props.label ?? 'Test vector'}
        value={value}
        onChange={setValue}
        componentLabels={props.axisLabels ?? ['X', 'Y', 'Z']}
        defaultLinked={props.defaultLinked}
        defaultMode={props.defaultMode}
        min={props.min}
        idPrefix="test-vector"
      />
      <output data-testid="vector-value">{JSON.stringify(value)}</output>
    </div>
  )
}

function getAxisInput(_label: string, axis: string) {
  const el = document.getElementById(`test-vector-${axis.toLowerCase()}`)
  if (!el) throw new Error(`Missing axis input test-vector-${axis.toLowerCase()}`)
  return el as HTMLInputElement
}

function getVectorValue(): number[] {
  return JSON.parse(screen.getByTestId('vector-value').textContent ?? '[]')
}

function worldWithBox(scale: [number, number, number] = [1, 1, 1]): RennWorld {
  const boxEntity = createDefaultEntity('box')
  return {
    version: '1.0',
    world: { camera: { control: 'free', mode: 'follow', target: boxEntity.id } },
    entities: [{ ...boxEntity, position: [0, 0, 0], rotation: [0, 0, 0], scale }],
  }
}

async function commitAxisValue(user: ReturnType<typeof userEvent.setup>, input: HTMLElement, text: string) {
  await user.click(input)
  await user.clear(input)
  await user.type(input, text)
  await user.tab()
}

function scrubAxis(input: HTMLElement, deltaPx: number) {
  fireEvent.pointerDown(input, { clientX: 100, button: 0, pointerId: 1 })
  fireEvent.pointerMove(input, { clientX: 100 + deltaPx, button: 0, pointerId: 1 })
  fireEvent.pointerUp(input, { clientX: 100 + deltaPx, button: 0, pointerId: 1 })
}

async function clickMode(user: ReturnType<typeof userEvent.setup>, label: 'Absolute values' | 'Relative offsets') {
  await user.click(screen.getByLabelText(label))
}

function scaleInputs() {
  return {
    x: screen.getByLabelText(/scale x/i),
    y: screen.getByLabelText(/scale y/i),
    z: screen.getByLabelText(/scale z/i),
  }
}

function scaleModeGroup() {
  return screen.getByRole('group', { name: /scale edit mode/i })
}

describe('VectorField integration', () => {
  describe('absolute ↔ relative mode switching', () => {
    it('absolute → relative without edit: shows zeros, stored value unchanged', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[2, 4, 6]} defaultLinked />)
      expect(getAxisInput('Test vector', 'X')).toHaveValue(2)
      await clickMode(user, 'Relative offsets')
      expect(getVectorValue()).toEqual([2, 4, 6])
      expect(getAxisInput('Test vector', 'X')).toHaveValue(0)
      expect(getAxisInput('Test vector', 'Y')).toHaveValue(0)
      expect(getAxisInput('Test vector', 'Z')).toHaveValue(0)
    })

    it('relative → absolute without edit: restores absolute display', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[2, 4, 6]} />)
      await clickMode(user, 'Relative offsets')
      await clickMode(user, 'Absolute values')
      expect(getAxisInput('Test vector', 'X')).toHaveValue(2)
      expect(getAxisInput('Test vector', 'Y')).toHaveValue(4)
      expect(getVectorValue()).toEqual([2, 4, 6])
    })

    it('ping-pong absolute → relative → absolute → relative: no spurious edits', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} defaultLinked />)
      await clickMode(user, 'Relative offsets')
      await clickMode(user, 'Absolute values')
      await clickMode(user, 'Relative offsets')
      await clickMode(user, 'Absolute values')
      expect(getVectorValue()).toEqual([1, 2, 3])
      expect(getAxisInput('Test vector', 'X')).toHaveValue(1)
      expect(getAxisInput('Test vector', 'Y')).toHaveValue(2)
      expect(getAxisInput('Test vector', 'Z')).toHaveValue(3)
    })

    it('absolute edit → relative: baseline is committed absolute value', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 1, 1]} defaultLinked />)
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '2')
      expect(getVectorValue()).toEqual([2, 2, 2])
      await clickMode(user, 'Relative offsets')
      expect(getAxisInput('Test vector', 'X')).toHaveValue(0)
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '0.5')
      expect(getVectorValue()).toEqual([2.5, 2.5, 2.5])
    })

    it('relative edit → absolute: displays committed absolute numbers', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 1, 1]} defaultLinked />)
      await clickMode(user, 'Relative offsets')
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '1')
      expect(getVectorValue()).toEqual([2, 2, 2])
      await clickMode(user, 'Absolute values')
      expect(getAxisInput('Test vector', 'X')).toHaveValue(2)
      expect(getAxisInput('Test vector', 'Y')).toHaveValue(2)
      expect(getAxisInput('Test vector', 'Z')).toHaveValue(2)
    })

    it('relative edit → absolute → relative: second relative baseline uses latest absolute', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 1, 1]} />)
      await clickMode(user, 'Relative offsets')
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '1')
      await clickMode(user, 'Absolute values')
      await clickMode(user, 'Relative offsets')
      expect(getAxisInput('Test vector', 'X')).toHaveValue(0)
      await commitAxisValue(user, getAxisInput('Test vector', 'Y'), '2')
      expect(getVectorValue()).toEqual([2, 3, 1])
    })

    it('uncommitted relative typing commits on mode switch to absolute', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} />)
      await clickMode(user, 'Relative offsets')
      const input = getAxisInput('Test vector', 'X')
      await user.click(input)
      await user.clear(input)
      await user.type(input, '0.5')
      await clickMode(user, 'Absolute values')
      expect(getVectorValue()).toEqual([1.5, 2, 3])
      expect(getAxisInput('Test vector', 'X')).toHaveValue(1.5)
    })

    it('uncommitted absolute typing commits on mode switch to relative', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} />)
      const input = getAxisInput('Test vector', 'X')
      await user.click(input)
      await user.clear(input)
      await user.type(input, '5')
      await clickMode(user, 'Relative offsets')
      expect(getVectorValue()).toEqual([5, 2, 3])
      expect(getAxisInput('Test vector', 'X')).toHaveValue(0)
    })

    it('linked scale: absolute uniform then relative offset preserves link', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[2, 2, 2]} defaultLinked />)
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '3')
      expect(getVectorValue()).toEqual([3, 3, 3])
      await clickMode(user, 'Relative offsets')
      await commitAxisValue(user, getAxisInput('Test vector', 'Z'), '0.5')
      expect(getVectorValue()).toEqual([3.5, 3.5, 3.5])
      await clickMode(user, 'Absolute values')
      expect(getAxisInput('Test vector', 'X')).toHaveValue(3.5)
      expect(getAxisInput('Test vector', 'Y')).toHaveValue(3.5)
      expect(getAxisInput('Test vector', 'Z')).toHaveValue(3.5)
    })

    it('unlinked scale: absolute per-axis survives mode round-trip', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 1, 1]} />)
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '2')
      expect(getVectorValue()).toEqual([2, 1, 1])
      await clickMode(user, 'Relative offsets')
      await commitAxisValue(user, getAxisInput('Test vector', 'Y'), '3')
      expect(getVectorValue()).toEqual([2, 4, 1])
      await clickMode(user, 'Absolute values')
      expect(getAxisInput('Test vector', 'X')).toHaveValue(2)
      expect(getAxisInput('Test vector', 'Y')).toHaveValue(4)
      expect(getAxisInput('Test vector', 'Z')).toHaveValue(1)
    })
  })

  describe('absolute mode', () => {
    it('unlinked: edits a single axis on blur', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} />)
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '5')
      expect(getVectorValue()).toEqual([5, 2, 3])
    })

    it('linked + equal: uniform scale when one axis changes', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[2, 2, 2]} defaultLinked />)
      await commitAxisValue(user, getAxisInput('Test vector', 'Y'), '4')
      expect(getVectorValue()).toEqual([4, 4, 4])
    })

    it('linked + unequal: applies delta to all axes', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} defaultLinked />)
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '3')
      expect(getVectorValue()).toEqual([3, 4, 5])
    })

    it('unlink restores per-axis editing', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[2, 2, 2]} defaultLinked />)
      await user.click(screen.getByLabelText('Test vector unlink axes'))
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '3')
      expect(getVectorValue()).toEqual([3, 2, 2])
    })

    it('link mid-session groups subsequent edits', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} />)
      await user.click(screen.getByLabelText('Test vector link axes'))
      await commitAxisValue(user, getAxisInput('Test vector', 'Z'), '5')
      expect(getVectorValue()).toEqual([3, 4, 5])
    })
  })

  describe('relative mode', () => {
    it('unlinked: adds offset to one axis from baseline at mode switch', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} />)
      await user.click(screen.getByLabelText('Relative offsets'))
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '0.5')
      expect(getVectorValue()).toEqual([1.5, 2, 3])
    })

    it('linked: adds same offset to all axes', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} defaultLinked />)
      await user.click(screen.getByLabelText('Relative offsets'))
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '0.25')
      expect(getVectorValue()).toEqual([1.25, 2.25, 3.25])
    })

    it('sequential relative edits accumulate from updated baseline', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[0, 0, 0]} />)
      await user.click(screen.getByLabelText('Relative offsets'))
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '1')
      expect(getVectorValue()).toEqual([1, 0, 0])
      await commitAxisValue(user, getAxisInput('Test vector', 'Y'), '2')
      expect(getVectorValue()).toEqual([1, 2, 0])
    })

    it('displays zero deltas when idle in relative mode', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[4, 5, 6]} />)
      await user.click(screen.getByLabelText('Relative offsets'))
      expect(getAxisInput('Test vector', 'X')).toHaveValue(0)
      expect(getAxisInput('Test vector', 'Y')).toHaveValue(0)
      expect(getAxisInput('Test vector', 'Z')).toHaveValue(0)
    })

    it('switching back to absolute shows stored values', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 1, 1]} />)
      await user.click(screen.getByLabelText('Relative offsets'))
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '2')
      await user.click(screen.getByLabelText('Absolute values'))
      expect(getAxisInput('Test vector', 'X')).toHaveValue(3)
      expect(getAxisInput('Test vector', 'Y')).toHaveValue(1)
    })
  })

  describe('mode × link combinations', () => {
    it('absolute + unlinked edits one axis only', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} />)
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '5')
      expect(getVectorValue()).toEqual([5, 2, 3])
    })

    it('absolute + linked + equal sets uniform value', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[2, 2, 2]} defaultLinked />)
      await commitAxisValue(user, getAxisInput('Test vector', 'Y'), '4')
      expect(getVectorValue()).toEqual([4, 4, 4])
    })

    it('absolute + linked + unequal applies shared delta', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} defaultLinked />)
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '4')
      expect(getVectorValue()).toEqual([4, 5, 6])
    })

    it('relative + unlinked offsets one axis', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[1, 2, 3]} />)
      await user.click(screen.getByLabelText('Relative offsets'))
      await commitAxisValue(user, getAxisInput('Test vector', 'Z'), '0.5')
      expect(getVectorValue()).toEqual([1, 2, 3.5])
    })

    it('relative + linked offsets all axes equally', async () => {
      const user = userEvent.setup({ delay: null })
      render(<ControlledVectorField initial={[0, 10, 20]} defaultLinked />)
      await user.click(screen.getByLabelText('Relative offsets'))
      await commitAxisValue(user, getAxisInput('Test vector', 'X'), '1')
      expect(getVectorValue()).toEqual([1, 11, 21])
    })
  })

  describe('scrub gestures', () => {
    it('absolute unlinked scrub updates one axis live', () => {
      render(<ControlledVectorField initial={[1, 2, 3]} />)
      scrubAxis(getAxisInput('Test vector', 'X'), 80)
      const value = getVectorValue()
      expect(value[0]).not.toBe(1)
      expect(value[1]).toBe(2)
      expect(value[2]).toBe(3)
    })

    it('relative linked scrub applies delta to all axes', () => {
      render(<ControlledVectorField initial={[1, 2, 3]} defaultLinked defaultMode="relative" />)
      scrubAxis(getAxisInput('Test vector', 'X'), 60)
      const value = getVectorValue()
      const delta = value[0] - 1
      expect(delta).not.toBe(0)
      expect(value[1]).toBeCloseTo(2 + delta, 5)
      expect(value[2]).toBeCloseTo(3 + delta, 5)
    })

    it('relative scrub does not double-count delta across moves', () => {
      render(<ControlledVectorField initial={[0, 0, 0]} defaultMode="relative" />)
      const input = getAxisInput('Test vector', 'X')
      fireEvent.pointerDown(input, { clientX: 100, button: 0, pointerId: 1 })
      fireEvent.pointerMove(input, { clientX: 130, button: 0, pointerId: 1 })
      const mid = getVectorValue()[0]!
      fireEvent.pointerMove(input, { clientX: 160, button: 0, pointerId: 1 })
      const end = getVectorValue()[0]!
      fireEvent.pointerUp(input, { clientX: 160, button: 0, pointerId: 1 })
      expect(end).toBeGreaterThan(mid)
      expect(mid).toBeGreaterThan(0)
    })
  })

  describe('UV-style two-axis group', () => {
    it('links only U and V, leaves third component unchanged', async () => {
      const user = userEvent.setup({ delay: null })
      render(
        <ControlledVectorField
          initial={[1, 2, 99]}
          axisLabels={['U', 'V', '']}
          defaultLinked
        />,
      )
      await commitAxisValue(user, getAxisInput('Test vector', 'U'), '4')
      expect(getVectorValue()).toEqual([4, 5, 99])
    })
  })
})

describe('PropertyPanel vector groups integration', () => {
  function renderPanel(scale: [number, number, number] = [1, 1, 1]) {
    const onWorldChange = vi.fn()
    let latestWorld = worldWithBox(scale)
    const Wrapper = () => {
      const [world, setWorld] = useState(latestWorld)
      return (
        <PropertyPanel
          world={world}
          assets={new Map()}
          selectedEntityIds={[world.entities[0]!.id]}
          onWorldChange={(next) => {
            latestWorld = next
            onWorldChange(next)
            setWorld(next)
          }}
        />
      )
    }
    render(<Wrapper />)
    return { onWorldChange, entityId: latestWorld.entities[0]!.id }
  }

  function positionGroup() {
    return screen.getByRole('group', { name: /position edit mode/i })
  }

  it('position defaults unlinked — X only', async () => {
    const user = userEvent.setup({ delay: null })
    const { onWorldChange } = renderPanel()
    await commitAxisValue(user, screen.getByLabelText(/position x/i), '5')
    const entity = onWorldChange.mock.calls.at(-1)![0].entities[0]
    expect(entity.position).toEqual([5, 0, 0])
  })

  it('scale defaults linked — uniform when equal', async () => {
    const user = userEvent.setup({ delay: null })
    const { onWorldChange } = renderPanel([2, 2, 2])
    await commitAxisValue(user, screen.getByLabelText(/scale x/i), '3')
    const entity = onWorldChange.mock.calls.at(-1)![0].entities[0]
    expect(entity.scale).toEqual([3, 3, 3])
  })


  it('scale unlink then per-axis edit', async () => {
    const user = userEvent.setup({ delay: null })
    const { onWorldChange } = renderPanel()
    await user.click(screen.getByLabelText('Scale unlink axes'))
    await commitAxisValue(user, screen.getByLabelText(/scale x/i), '2')
    const entity = onWorldChange.mock.calls.at(-1)![0].entities[0]
    expect(entity.scale).toEqual([2, 1, 1])
  })

  it('position relative offset', async () => {
    const user = userEvent.setup({ delay: null })
    const { onWorldChange } = renderPanel()
    await user.click(within(positionGroup()).getByLabelText('Relative offsets'))
    await commitAxisValue(user, screen.getByLabelText(/position y/i), '3')
    const entity = onWorldChange.mock.calls.at(-1)![0].entities[0]
    expect(entity.position).toEqual([0, 3, 0])
  })

  it('rotation relative linked applies delta to all euler components', async () => {
    const user = userEvent.setup({ delay: null })
    const { onWorldChange } = renderPanel()
    const rotationGroup = screen.getByRole('group', { name: /rotation edit mode/i })
    await user.click(within(rotationGroup).getByLabelText('Relative offsets'))
    await user.click(screen.getByLabelText('Rotation link axes'))
    await commitAxisValue(user, screen.getByLabelText(/rotation x/i), '0.5')
    const entity = onWorldChange.mock.calls.at(-1)![0].entities[0]
    expect(entity.rotation).toEqual([0.5, 0.5, 0.5])
  })

  describe('scale absolute ↔ relative switching', () => {
    function lastEntity(onWorldChange: ReturnType<typeof vi.fn>) {
      return onWorldChange.mock.calls.at(-1)![0].entities[0]
    }

    it('absolute linked uniform → relative zeros → relative offset → absolute shows result', async () => {
      const user = userEvent.setup({ delay: null })
      const { onWorldChange } = renderPanel([2, 2, 2])
      const { x } = scaleInputs()
      await commitAxisValue(user, x, '3')
      await vi.waitFor(() => {
        expect(lastEntity(onWorldChange).scale).toEqual([3, 3, 3])
      })

      await user.click(within(scaleModeGroup()).getByLabelText('Relative offsets'))
      expect(x).toHaveValue(0)

      await commitAxisValue(user, x, '0.5')
      await vi.waitFor(() => {
        expect(lastEntity(onWorldChange).scale).toEqual([3.5, 3.5, 3.5])
      })

      await user.click(within(scaleModeGroup()).getByLabelText('Absolute values'))
      expect(x).toHaveValue(3.5)
      expect(screen.getByLabelText(/scale y/i)).toHaveValue(3.5)
      expect(screen.getByLabelText(/scale z/i)).toHaveValue(3.5)
    })

    it('scale ping-pong modes without edits preserves scale', async () => {
      const user = userEvent.setup({ delay: null })
      renderPanel([1, 2, 3])
      const { x, y, z } = scaleInputs()
      const group = scaleModeGroup()
      await user.click(within(group).getByLabelText('Relative offsets'))
      await user.click(within(group).getByLabelText('Absolute values'))
      await user.click(within(group).getByLabelText('Relative offsets'))
      await user.click(within(group).getByLabelText('Absolute values'))
      expect(x).toHaveValue(1)
      expect(y).toHaveValue(2)
      expect(z).toHaveValue(3)
    })

    it('scale unlinked: absolute per-axis edit survives relative round-trip', async () => {
      const user = userEvent.setup({ delay: null })
      const { onWorldChange } = renderPanel()
      await user.click(screen.getByLabelText('Scale unlink axes'))
      const { x, y } = scaleInputs()
      await commitAxisValue(user, x, '2')
      await vi.waitFor(() => {
        expect(lastEntity(onWorldChange).scale).toEqual([2, 1, 1])
      })

      await user.click(within(scaleModeGroup()).getByLabelText('Relative offsets'))
      await commitAxisValue(user, y, '1')
      await vi.waitFor(() => {
        expect(lastEntity(onWorldChange).scale).toEqual([2, 2, 1])
      })

      await user.click(within(scaleModeGroup()).getByLabelText('Absolute values'))
      expect(x).toHaveValue(2)
      expect(y).toHaveValue(2)
      expect(scaleInputs().z).toHaveValue(1)
    })

    it('scale relative offset commits when switching to absolute mid-typing', async () => {
      const user = userEvent.setup({ delay: null })
      const { onWorldChange } = renderPanel([1, 1, 1])
      const group = scaleModeGroup()
      const { x } = scaleInputs()
      await user.click(within(group).getByLabelText('Relative offsets'))
      await user.click(x)
      await user.clear(x)
      await user.type(x, '0.25')
      await user.click(within(group).getByLabelText('Absolute values'))
      await vi.waitFor(() => {
        expect(lastEntity(onWorldChange).scale).toEqual([1.25, 1.25, 1.25])
      })
      expect(x).toHaveValue(1.25)
    })
  })
})
