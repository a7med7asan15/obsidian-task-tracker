import { EMPTY_QUERY } from '../query/apply';
import type { Query } from '../query/types';

export interface StoreState {
  query: Query;
  selectedPath: string | null;
  /** Project the view shows; null for tasks without a project. */
  project: string | null;
}

/** Sort keys every task has, whatever its project's fields. */
const BUILTIN_SORT_KEYS = ['updated', 'created', 'title', 'id'];

export class Store {
  private state: StoreState;
  private listeners = new Set<() => void>();

  constructor(project: string | null = null) {
    this.state = { query: { ...EMPTY_QUERY }, selectedPath: null, project };
  }

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

  clearFilter(key: string): void {
    const { [key]: _dropped, ...rest } = this.state.query.filters;
    this.setQuery({ filters: rest });
  }

  /**
   * Switch project. Filters always reset, since values mean nothing across
   * projects. Grouping and sort survive when the new project has the field.
   */
  setProject(project: string | null, fieldKeys: string[]): void {
    const q = this.state.query;
    const keepGroup = q.groupBy !== null && fieldKeys.includes(q.groupBy);
    const keepSort = BUILTIN_SORT_KEYS.includes(q.sortKey) || fieldKeys.includes(q.sortKey);
    this.set({
      project,
      selectedPath: null,
      query: {
        ...q,
        filters: {},
        groupBy: keepGroup ? q.groupBy : null,
        sortKey: keepSort ? q.sortKey : EMPTY_QUERY.sortKey,
      },
    });
  }

  select(path: string | null): void {
    this.set({ ...this.state, selectedPath: path });
  }
}
