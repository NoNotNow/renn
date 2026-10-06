import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { TransformerConfig } from '@/types/transformer'
import type { Entity } from '@/types/world'
import type { ParamLayer } from '@/utils/paramScopes'
import ParamField from './ParamField'
import StageParamsForm, { type StageParamContext } from './StageParamsForm'
import { ParamEntityProvider } from './ParamEntityContext'

const stage: TransformerConfig = {
  type: 'custom',
  name: 'Route planner',
  priority: 1,
  code: '/* @params [{"key":"vehicleWidth","type":"number","default":2},{"key":"budget","type":"string","default":"full"}] */',
  params: { vehicleWidth: 2, budget: 'full' },
} as TransformerConfig

const bindingLayer: ParamLayer = {
  kind: 'binding',
  label: 'AV autopilot',
  scopeKey: '',
  path: [{ kind: 'stack', index: 0 }],
  params: { vehicleWidth: 4, budget: 'eco' },
}
const memberLayer: ParamLayer = {
  kind: 'member',
  label: 'Route planner',
  scopeKey: 'stack:0/member:p:0',
  path: [
    { kind: 'stack', index: 0 },
    { kind: 'member', pipeId: 'p', memberIndex: 0 },
  ],
  params: { tickEvery: 6 },
}

function context(onLayerParamsChange = vi.fn()): StageParamContext {
  return {
    layers: [{ kind: 'stage', label: 'Route planner', scopeKey: '', path: [], params: stage.params! }, bindingLayer, memberLayer],
    onLayerParamsChange,
  }
}

function commitNumber(testId: string, value: string) {
  const input = screen.getByTestId(testId).querySelector('input') ?? screen.getByTestId(testId)
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

describe('StageParamsForm effective values', () => {
  it('shows the value the pipe binding sets, not the stage value, with a "from pipe" badge', () => {
    render(<StageParamsForm stage={stage} onParamsChange={vi.fn()} paramContext={context()} />)
    expect(screen.getByDisplayValue('4')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('2')).toBeNull()
    expect(screen.getByDisplayValue('eco')).toBeInTheDocument()
    const badge = screen.getByTestId('param-source-vehicleWidth')
    expect(badge).toHaveTextContent('from pipe: binding')
    expect(badge.title).toContain('stage: 2')
    expect(badge.title).toContain('> AV autopilot (binding): 4')
    expect(badge.title).toContain('no effect on this entity')
  })

  it('without a context the plain stage value shows and no badge', () => {
    render(<StageParamsForm stage={stage} onParamsChange={vi.fn()} />)
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
    expect(screen.queryByTestId('param-source-vehicleWidth')).toBeNull()
  })

  it('editing an overridden key writes the winning layer and leaves the stage alone', () => {
    const onParamsChange = vi.fn()
    const onLayer = vi.fn()
    render(<StageParamsForm stage={stage} onParamsChange={onParamsChange} paramContext={context(onLayer)} />)
    commitNumber('param-field-vehicleWidth', '5')
    expect(onLayer).toHaveBeenCalledWith(bindingLayer, { vehicleWidth: 5, budget: 'eco' })
    expect(onParamsChange).not.toHaveBeenCalled()
  })

  it('reset removes the override at the winning layer', () => {
    const onLayer = vi.fn()
    render(<StageParamsForm stage={stage} onParamsChange={vi.fn()} paramContext={context(onLayer)} />)
    fireEvent.click(screen.getByTestId('param-reset-vehicleWidth'))
    expect(onLayer).toHaveBeenCalledWith(bindingLayer, { budget: 'eco' })
  })

  it('shows and edits a per-stage-member scope param (tickEvery) in the stage drawer', () => {
    const onLayer = vi.fn()
    render(<StageParamsForm stage={stage} onParamsChange={vi.fn()} paramContext={context(onLayer)} />)
    expect(screen.getByTestId('param-source-tickEvery')).toHaveTextContent('from pipe: this stage')
    commitNumber('param-field-tickEvery', '2')
    expect(onLayer).toHaveBeenCalledWith(memberLayer, { tickEvery: 2 })
  })

  it('a key set only on the stage is edited on the stage', () => {
    const onParamsChange = vi.fn()
    const only: StageParamContext = { ...context(), layers: [{ kind: 'stage', label: 'x', scopeKey: '', path: [], params: stage.params! }] }
    render(<StageParamsForm stage={stage} onParamsChange={onParamsChange} paramContext={only} />)
    commitNumber('param-field-vehicleWidth', '3')
    expect(onParamsChange).toHaveBeenCalledWith({ vehicleWidth: 3, budget: 'full' })
  })

  it('Add can target this stage member instead of the stage', () => {
    const onLayer = vi.fn()
    const onParamsChange = vi.fn()
    render(<StageParamsForm stage={stage} onParamsChange={onParamsChange} paramContext={context(onLayer)} />)
    fireEvent.change(screen.getByTestId('param-add-key'), { target: { value: 'scanEvery' } })
    fireEvent.change(screen.getByTestId('param-add-target'), { target: { value: 'member' } })
    fireEvent.click(screen.getByTestId('param-add'))
    expect(onLayer).toHaveBeenCalledWith(memberLayer, { tickEvery: 6, scanEvery: 0 })
    expect(onParamsChange).not.toHaveBeenCalled()
  })
})

const entity = (id: string, name: string) =>
  ({ id, name, bodyType: 'dynamic', shape: { type: 'box', width: 1, height: 1, depth: 1 }, position: [0, 0, 0] }) as Entity

describe('ParamField entity id picker', () => {
  const idDef = { key: 'goalId', type: 'entityId' as const }
  const entities = [entity('car_1', 'Red car'), entity('box_2', 'Box')]

  it('picks an entity through the shared search', () => {
    const onChange = vi.fn()
    render(
      <ParamEntityProvider entities={entities}>
        <ParamField def={idDef} value="" onChange={onChange} />
      </ParamEntityProvider>,
    )
    fireEvent.click(screen.getByTestId('param-field-goalId-pick'))
    fireEvent.change(screen.getByTestId('param-field-goalId-search-input'), { target: { value: 'red' } })
    fireEvent.click(screen.getByTestId('param-field-goalId-search-result-car_1'))
    expect(onChange).toHaveBeenCalledWith('car_1')
  })

  it('stays a plain text field without a world context', () => {
    const onChange = vi.fn()
    render(<ParamField def={idDef} value="" onChange={onChange} />)
    expect(screen.queryByTestId('param-field-goalId-pick')).toBeNull()
    fireEvent.change(screen.getByTestId('param-field-goalId'), { target: { value: 'abc' } })
    fireEvent.blur(screen.getByTestId('param-field-goalId'))
    expect(onChange).toHaveBeenCalledWith('abc')
  })

  it('id lists (threatIds, even when declared json) add and remove ids', () => {
    const onChange = vi.fn()
    render(
      <ParamEntityProvider entities={entities}>
        <ParamField def={{ key: 'threatIds', type: 'json' }} value={['box_2']} onChange={onChange} />
      </ParamEntityProvider>,
    )
    fireEvent.click(screen.getByTestId('param-field-threatIds-remove-box_2'))
    expect(onChange).toHaveBeenLastCalledWith([])
    fireEvent.click(screen.getByTestId('param-field-threatIds-pick'))
    fireEvent.change(screen.getByTestId('param-field-threatIds-search-input'), { target: { value: 'car' } })
    fireEvent.click(screen.getByTestId('param-field-threatIds-search-result-car_1'))
    expect(onChange).toHaveBeenLastCalledWith(['box_2', 'car_1'])
  })
})
