/** Lazily-created default store for the browser attach handler; tests/UI may inject one. */
import { IdbEvolutionStore, type EvolutionStore } from '../core/store'

let store: EvolutionStore | null = null

export function setAvEvolutionStore(s: EvolutionStore | null): void {
  store = s
}

export function getAvEvolutionStore(): EvolutionStore {
  return (store ??= new IdbEvolutionStore())
}
