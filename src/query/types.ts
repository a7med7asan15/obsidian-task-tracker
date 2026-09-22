import type { Task } from '../model/types';

export interface Query {
  search: string;
  /** field key -> selected values. Empty array means no filter on that field. */
  filters: Record<string, string[]>;
  /** A schema field key, or 'title' / 'updated' / 'created' / 'id'. */
  sortKey: string;
  sortDir: 'asc' | 'desc';
  /** A schema field key, or null for a single flat group. */
  groupBy: string | null;
  hideDone: boolean;
}

export interface Group {
  key: string;
  tasks: Task[];
}

export const NO_VALUE_GROUP = 'No value';
