import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PropertyPanel from '@/components/PropertyPanel'
import { EditorUndoProvider, type EditorUndoApi } from '@/contexts/EditorUndoContext'
import type { RennWorld, Entity } from '@/types/world'

vi.mock('@/utils/uiLogger', () => ({
  uiLogger: { change: vi.fn(), delete: vi.fn(), click: vi.fn(), log: vi.fn(), select: vi.fn(), upload: vi.fn() },
}))

/** Two boxes that differ in position x/y (z shared), and in every material sub-field. */
function mixedWorld(): RennWorld {
  return {
    version: '1.0',
    world: { camera: { control: 'free', mode: 'follow', target: 'a' } },
    entities: [
      {
        id: 'a',
        name: 'A',
        bodyType: 'static',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [1, 2, 5],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        material: { color: [1, 0, 0], roughness: 0.2, metalness: 0.9, opacity: 1 },
      },
      {
        id: 'b',
        name: 'B',
        bodyType: 'static',
        shape: { type: 'box', width: 1, height: 1, depth: 1 },
        position: [3, 4, 5],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        material: { color: [0, 0, 1], roughness: 0.8, metalness: 0.1, opacity: 0.5 },
      },
    ],
  }
}

const IDS = ['a', 'b']

function setup(world: RennWorld = mixedWorld(), undo?: EditorUndoApi) {
  const onWorldChange = vi.fn()
  const panel = (
    <PropertyPanel world={world} assets={new Map()} selectedEntityIds={IDS} onWorldChange={onWorldChange} />
  )
  render(undo ? <EditorUndoProvider value={undo}>{panel}</EditorUndoProvider> : panel)
  return onWorldChange
}

function lastWorld(fn: ReturnType<typeof vi.fn>): RennWorld {
  return fn.mock.calls[fn.mock.calls.length - 1]![0] as RennWorld
}

function ent(w: RennWorld, id: string): Entity {
  return w.entities.find((e) => e.id === id)!
}

function typeInto(input: HTMLElement, value: string) {
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

describe('PropertyPanel multi-select mixed values', () => {
  describe('display', () => {
    it('shows differing vector components and material fields as mixed, shared ones normally', () => {
      setup()
      const posX = screen.getByLabelText('Position X') as HTMLInputElement
      const posY = screen.getByLabelText('Position Y') as HTMLInputElement
      const posZ = screen.getByLabelText('Position Z') as HTMLInputElement
      expect(posX).toHaveDisplayValue('')
      expect(posX).toHaveAttribute('placeholder', 'Mixed')
      expect(posY).toHaveDisplayValue('')
      expect(posZ).toHaveDisplayValue('5')
      expect(posZ).not.toHaveAttribute('placeholder')

      for (const name of [/roughness/i, /metalness/i, /opacity/i]) {
        const input = screen.getByLabelText(name)
        expect(input).toHaveDisplayValue('')
        expect(input).toHaveAttribute('placeholder', 'Mixed')
      }
      expect(screen.getByLabelText('Material color')).toHaveAttribute('data-mixed', 'true')
    })

    it('does not show the first entity value as a fake common value for mixed material', () => {
      setup()
      expect(screen.getByLabelText(/roughness/i)).not.toHaveDisplayValue('0.2')
      expect(screen.queryByText(/Material properties differ across selection/i)).toBeNull()
    })
  })

  describe('no accidental overwrite', () => {
    it('focusing and leaving a mixed field without typing does not change anything', () => {
      const onWorldChange = setup()
      for (const label of ['Position X', 'Position Y']) {
        const input = screen.getByLabelText(label)
        fireEvent.focus(input)
        fireEvent.blur(input)
      }
      const rough = screen.getByLabelText(/roughness/i)
      fireEvent.focus(rough)
      fireEvent.blur(rough)
      expect(onWorldChange).not.toHaveBeenCalled()
    })
  })

  describe('vector components', () => {
    it('editing position X keeps each entity own Y and Z', async () => {
      const onWorldChange = setup()
      typeInto(screen.getByLabelText('Position X'), '10')
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').position).toEqual([10, 2, 5])
      expect(ent(w, 'b').position).toEqual([10, 4, 5])
    })

    it('editing a shared component (Z) sets it for all and keeps mixed ones', () => {
      const onWorldChange = setup()
      typeInto(screen.getByLabelText('Position Z'), '7')
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').position).toEqual([1, 2, 7])
      expect(ent(w, 'b').position).toEqual([3, 4, 7])
    })

    it('relative mode adds the offset to each entity own value', async () => {
      const user = userEvent.setup({ delay: null })
      const onWorldChange = setup()
      await user.click(screen.getAllByLabelText('Relative offsets')[0]!)
      const posX = screen.getByLabelText('Position X')
      expect(posX).toHaveDisplayValue('0')
      typeInto(posX, '1')
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').position).toEqual([2, 2, 5])
      expect(ent(w, 'b').position).toEqual([4, 4, 5])
    })

    it('mixed scale X keeps each entity own Y/Z and unlinks while mixed', () => {
      const world = mixedWorld()
      world.entities[0]!.scale = [1, 2, 3]
      world.entities[1]!.scale = [4, 2, 3]
      const onWorldChange = setup(world)
      typeInto(screen.getByLabelText('Scale X'), '9')
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').scale).toEqual([9, 2, 3])
      expect(ent(w, 'b').scale).toEqual([9, 2, 3])
    })
  })

  describe('material sub-fields', () => {
    it('changing only the colour preserves each entity roughness, metalness and opacity', () => {
      const onWorldChange = setup()
      fireEvent.change(screen.getByLabelText('Material color'), { target: { value: '#00ff00' } })
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').material).toEqual({ color: [0, 1, 0], roughness: 0.2, metalness: 0.9, opacity: 1 })
      expect(ent(w, 'b').material).toEqual({ color: [0, 1, 0], roughness: 0.8, metalness: 0.1, opacity: 0.5 })
    })

    it('changing only roughness preserves each entity colour and other fields', () => {
      const onWorldChange = setup()
      typeInto(screen.getByLabelText(/roughness/i), '0.6')
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').material).toEqual({ color: [1, 0, 0], roughness: 0.6, metalness: 0.9, opacity: 1 })
      expect(ent(w, 'b').material).toEqual({ color: [0, 0, 1], roughness: 0.6, metalness: 0.1, opacity: 0.5 })
    })

    it('keeps a per-entity texture when only colour changes (mixed map)', () => {
      const world = mixedWorld()
      world.entities[0]!.material = { ...world.entities[0]!.material, map: 'tex-a' }
      const onWorldChange = setup(world)
      expect(screen.getByTestId('material-map-mixed')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Material color'), { target: { value: '#00ff00' } })
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').material?.map).toBe('tex-a')
      expect(ent(w, 'b').material?.map).toBeUndefined()
    })

    it('entity with an empty material gets only the edited field added', () => {
      const world = mixedWorld()
      world.entities[1]!.material = {}
      const onWorldChange = setup(world)
      typeInto(screen.getByLabelText(/metalness/i), '0.4')
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').material).toEqual({ color: [1, 0, 0], roughness: 0.2, metalness: 0.4, opacity: 1 })
      expect(ent(w, 'b').material).toEqual({ metalness: 0.4 })
    })
  })

  describe('common-value fields', () => {
    it('shared material fields display their value and edit normally for all', () => {
      const world = mixedWorld()
      world.entities[1]!.material = { ...world.entities[1]!.material, roughness: 0.2 }
      const onWorldChange = setup(world)
      expect(screen.getByLabelText(/roughness/i)).toHaveDisplayValue('0.2')
      typeInto(screen.getByLabelText(/roughness/i), '0.7')
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').material?.roughness).toBe(0.7)
      expect(ent(w, 'b').material?.roughness).toBe(0.7)
      expect(ent(w, 'b').material?.color).toEqual([0, 0, 1])
    })

    it('identical materials: colour change applies to both as before', () => {
      const world = mixedWorld()
      world.entities[1]!.material = { ...world.entities[0]!.material }
      const onWorldChange = setup(world)
      expect(screen.getByLabelText('Material color')).not.toHaveAttribute('data-mixed')
      fireEvent.change(screen.getByLabelText('Material color'), { target: { value: '#00ff00' } })
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').material?.color).toEqual([0, 1, 0])
      expect(ent(w, 'b').material?.color).toEqual([0, 1, 0])
    })

    it('shared physics fields still apply to all selected', () => {
      const onWorldChange = setup()
      typeInto(screen.getByLabelText(/friction/i), '0.3')
      const w = lastWorld(onWorldChange)
      expect(ent(w, 'a').friction).toBe(0.3)
      expect(ent(w, 'b').friction).toBe(0.3)
    })
  })

  describe('undo', () => {
    it('a mixed multi-entity edit is one world change and one undo step', () => {
      const undo: EditorUndoApi = { pushBeforeEdit: vi.fn(), notifyScrubStart: vi.fn(), notifyScrubEnd: vi.fn() }
      const onWorldChange = setup(mixedWorld(), undo)
      typeInto(screen.getByLabelText('Position X'), '10')
      expect(undo.pushBeforeEdit).toHaveBeenCalledTimes(1)
      expect(onWorldChange).toHaveBeenCalledTimes(1)

      vi.mocked(undo.pushBeforeEdit).mockClear()
      onWorldChange.mockClear()
      typeInto(screen.getByLabelText(/roughness/i), '0.6')
      expect(undo.pushBeforeEdit).toHaveBeenCalledTimes(1)
      expect(onWorldChange).toHaveBeenCalledTimes(1)
    })
  })
})
