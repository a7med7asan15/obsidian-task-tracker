import type { Task } from '../model/types';
import type { FieldDef } from '../schema/types';
import { NO_VALUE_GROUP, type Group, type Query } from './types';

export { NO_VALUE_GROUP } from './types';
export type { Group, Query } from './types';

export const EMPTY_QUERY: Query = {
  search: '',
  filters: {},
  sortKey: 'updated',
  sortDir: 'desc',
  groupBy: null,
  hideDone: false,
};

/** Every value a task holds for `key`, as strings. Multiselect yields many. */
function valuesOf(task: Task, key: string): string[] {
  if (key === 'title') return [task.title];
  if (key === 'id') return task.id ? [task.id] : [];
  if (key === 'created') return task.created ? [task.created] : [];
  if (key === 'updated') return task.updated ? [task.updated] : [];

  const raw = task.fields[key];
  if (raw === null || raw === undefined || raw === '') return [];
  if (Array.isArray(raw)) return raw.map(String);
  return [String(raw)];
}

function matchesSearch(task: Task, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (q === '') return true;
  const haystack = [task.title, task.description, task.id ?? ''].join('\n').toLowerCase();
  return haystack.includes(q);
}

function matchesFilters(task: Task, filters: Record<string, string[]>): boolean {
  for (const [key, wanted] of Object.entries(filters)) {
    if (wanted.length === 0) continue;
    const have = valuesOf(task, key);
    if (!have.some((v) => wanted.includes(v))) return false;
  }
  return true;
}

function compare(a: Task, b: Task, key: string, dir: 'asc' | 'desc'): number {
  const av = valuesOf(a, key)[0];
  const bv = valuesOf(b, key)[0];

  // Empty values always sort last, whichever direction is active.
  if (av === undefined && bv === undefined) return 0;
  if (av === undefined) return 1;
  if (bv === undefined) return -1;

  const an = Number(av);
  const bn = Number(bv);
  const cmp =
    Number.isFinite(an) && Number.isFinite(bn) && av.trim() !== '' && bv.trim() !== ''
      ? an - bn
      : av.localeCompare(bv);

  return dir === 'asc' ? cmp : -cmp;
}

function groupOrder(key: string, schema: FieldDef[]): string[] | null {
  const def = schema.find((f) => f.key === key);
  return def?.options && def.options.length > 0 ? def.options : null;
}

export function applyQuery(
  tasks: Task[],
  query: Query,
  schema: FieldDef[],
  doneOptions: string[],
  statusKey: string,
): Group[] {
  const filtered = tasks.filter((t) => {
    if (!matchesSearch(t, query.search)) return false;
    if (!matchesFilters(t, query.filters)) return false;
    if (query.hideDone && valuesOf(t, statusKey).some((v) => doneOptions.includes(v))) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => compare(a, b, query.sortKey, query.sortDir));

  if (query.groupBy === null) {
    return [{ key: '', tasks: sorted }];
  }

  const buckets = new Map<string, Task[]>();
  for (const t of sorted) {
    const vals = valuesOf(t, query.groupBy);
    const keys = vals.length > 0 ? vals : [NO_VALUE_GROUP];
    for (const k of keys) {
      const list = buckets.get(k) ?? [];
      list.push(t);
      buckets.set(k, list);
    }
  }

  const declared = groupOrder(query.groupBy, schema);
  const keys = [...buckets.keys()].sort((a, b) => {
    if (a === NO_VALUE_GROUP) return 1;
    if (b === NO_VALUE_GROUP) return -1;
    if (declared) {
      const ai = declared.indexOf(a);
      const bi = declared.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
    }
    return a.localeCompare(b);
  });

  return keys.map((k) => ({ key: k, tasks: buckets.get(k) ?? [] }));
}
