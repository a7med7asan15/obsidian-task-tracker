import { EMPTY_QUERY } from '../query/apply';
import type { Query } from '../query/types';

export interface StoreState {
  query: Query;
  selectedPath: string | null;
}

export class Store {
  private state: StoreState = { query: { ...EMPTY_QUERY }, selectedPath: null };
  private listeners = new Set<() => void>();

  getState(): StoreState {
    return this.state;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private set(next: StoreState): void {
    this.state = next;
    for (const cb of this.listeners) cb();
  }

  setQuery(patch: Partial<Query>): void {
    this.set({ ...this.state, query: { ...this.state.query, ...patch } });
  }

  toggleFilter(key: string, value: string): void {
    const current = this.state.query.filters[key] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    this.setQuery({ filters: { ...this.state.query.filters, [key]: next } });
  }

  select(path: string | null): void {
    this.set({ ...this.state, selectedPath: path });
  }
}
