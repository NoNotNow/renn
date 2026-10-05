import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ParamDef } from '@/types/paramSchema'
import type { TransformerConfig } from '@/types/transformer'
import ParamForm from './ParamForm'
import StageParamsForm from './StageParamsForm'
import PipeParamsStrip from '@/components/workspace/pipeNav/PipeParamsStrip'

const defs: ParamDef[] = [
  { key: 'cruiseSpeed', type: 'number', default: 10, min: 0, unit: 'm/s', group: 'Speed' },
  { key: 'debugDraw', type: 'boolean', default: true },
  { key: 'mode', type: 'enum', default: 'a', options: [{ value: 'a' }, { value: 'b', label: 'Bee' }] },
  { key: 'goal', type: 'vec3', default: [0, 0, 0] },
  { key: 'name', type: 'string', default: '' },
  { key: 'tune', type: 'integer', default: 1, advanced: true },
]

function change(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } })
}

describe('ParamForm', () => {
  it('renders one control per type and reports changes by key', () => {
    const onChange = vi.fn()
    render(<ParamForm defs={defs} values={{}} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('param-field-debugDraw'))
    expect(onChange).toHaveBeenLastCalledWith('debugDraw', false)
    change('param-field-mode', '1')
    expect(onChange).toHaveBeenLastCalledWith('mode', 'b')
    fireEvent.blur(screen.getByTestId('param-field-name'), { target: { value: 'x' } })
  })

  it('does not clamp typed numbers outside min/max (hint only)', () => {
    const onChange = vi.fn()
    render(<ParamForm defs={[{ key: 'cruiseSpeed', type: 'number', default: 10, min: 0, max: 20 }]} values={{ cruiseSpeed: 1000 }} onChange={onChange} />)
    const input = screen.getByDisplayValue('1000')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '-5' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith('cruiseSpeed', -5)
  })

  it('shows stored values outside the range unchanged', () => {
    render(<ParamForm defs={[{ key: 'cruiseSpeed', type: 'number', min: 0, max: 20 }]} values={{ cruiseSpeed: 1000 }} />)
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument()
  })

  it('marks overridden fields and resets by removing the key (undefined)', () => {
    const onChange = vi.fn()
    render(<ParamForm defs={defs} values={{ cruiseSpeed: 12 }} onChange={onChange} />)
    fireEvent.click(screen.getByTestId('param-reset-cruiseSpeed'))
    expect(onChange).toHaveBeenLastCalledWith('cruiseSpeed', undefined)
    expect(screen.queryByTestId('param-reset-debugDraw')).toBeNull()
  })

  it('an explicit value equal to the default is not marked overridden', () => {
    render(<ParamForm defs={defs} values={{ cruiseSpeed: 10 }} onChange={vi.fn()} />)
    expect(screen.queryByTestId('param-reset-cruiseSpeed')).toBeNull()
  })

  it('inherited values show as effective and the field is marked once set at this scope', () => {
    render(<ParamForm defs={defs} values={{}} inheritedValues={{ cruiseSpeed: 7 }} onChange={vi.fn()} />)
    expect(screen.getByDisplayValue('7')).toBeInTheDocument()
    expect(screen.queryByTestId('param-reset-cruiseSpeed')).toBeNull()
    const { unmount } = render(<ParamForm defs={defs} values={{ cruiseSpeed: 7 }} inheritedValues={{ cruiseSpeed: 7 }} onChange={vi.fn()} />)
    expect(screen.getByTestId('param-reset-cruiseSpeed')).toBeInTheDocument()
    unmount()
  })

  it('edits one vec3 component and keeps the others', () => {
    const onChange = vi.fn()
    render(<ParamForm defs={defs} values={{ goal: [1, 2, 3] }} onChange={onChange} />)
    const input = screen.getByDisplayValue('2')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenLastCalledWith('goal', [1, 9, 3])
  })

  it('groups: ungrouped first, advanced collapsed', () => {
    render(<ParamForm defs={defs} values={{}} />)
    expect(screen.getByText('Speed')).toBeInTheDocument()
    expect(screen.getByText('Advanced')).toBeInTheDocument()
    expect((screen.getByText('Advanced').closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('is read-only without onChange', () => {
    render(<ParamForm defs={defs} values={{}} />)
    expect(screen.getByTestId('param-field-debugDraw')).toBeDisabled()
  })

  it('adds a new param and toggles the JSON editor', () => {
    const onChange = vi.fn()
    const onReplace = vi.fn()
    render(<ParamForm defs={[]} values={{ a: 1 }} onChange={onChange} onReplace={onReplace} allowAdd />)
    change('param-add-key', 'tickEvery')
    fireEvent.click(screen.getByTestId('param-add'))
    expect(onChange).toHaveBeenLastCalledWith('tickEvery', 0)
    fireEvent.click(screen.getByTestId('param-json-toggle'))
    fireEvent.change(screen.getByTestId('pipe-params-json'), { target: { value: '{"z":1}' } })
    fireEvent.click(screen.getByTestId('pipe-params-json-apply'))
    expect(onReplace).toHaveBeenCalledWith({ z: 1 })
  })
})

describe('StageParamsForm', () => {
  it('writes the complete next params object, keeping unrelated keys', () => {
    const onParamsChange = vi.fn()
    const stage: TransformerConfig = { type: 'custom', code: 'function transform(){return {}}', params: { a: 1, keep: [1, 2, 3] } }
    render(<StageParamsForm stage={stage} onParamsChange={onParamsChange} />)
    const input = screen.getByTestId('param-field-a').querySelector('input')!
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '4' } })
    fireEvent.blur(input)
    expect(onParamsChange).toHaveBeenLastCalledWith({ a: 4, keep: [1, 2, 3] })
  })

  it('preset: nested perimeter keys are edited in place', () => {
    const onParamsChange = vi.fn()
    const stage: TransformerConfig = {
      type: 'wanderer',
      params: { speed: 2, perimeter: { center: [0, 0, 0], halfExtents: [5, 6, 7] } },
    }
    render(<StageParamsForm stage={stage} onParamsChange={onParamsChange} />)
    const input = screen.getByDisplayValue('6')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.blur(input)
    const next = onParamsChange.mock.calls.at(-1)![0] as { perimeter: { center: number[]; halfExtents: number[] } }
    expect(next.perimeter.halfExtents).toEqual([5, 8, 7])
    expect(next.perimeter.center).toEqual([0, 0, 0])
  })

  it('shows a warning for a broken @params block and still lists inferred fields', () => {
    render(<StageParamsForm stage={{ type: 'custom', code: '/* @params [ */ function transform(){}', params: { q: 1 } }} />)
    expect(screen.getByTestId('param-schema-errors')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1')).toBeInTheDocument()
  })
})

describe('PipeParamsStrip (compat)', () => {
  it('keeps the strip contract: typed fields from paramDefs, values from the binding scope', () => {
    const onParamChange = vi.fn()
    render(
      <PipeParamsStrip
        pipe={{ id: 'p', name: 'P', stageIds: [], stages: [], paramDefs: [{ key: 'speed', type: 'number', default: 5 }] }}
        binding={{ pipeId: 'p', params: { speed: 3 } }}
        onParamChange={onParamChange}
      />,
    )
    const input = screen.getByDisplayValue('3')
    fireEvent.change(input, { target: { value: '7' } })
    expect(onParamChange).toHaveBeenCalledWith('speed', 7)
  })

  it('renders nothing without defs, values or JSON handler', () => {
    const { container } = render(<PipeParamsStrip pipe={{ id: 'p', name: 'P', stageIds: [], stages: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
