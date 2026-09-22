import { DEFAULT_SCHEMA } from '../schema/defaults';
import type { TaskTrackerSettings } from './types';

export const DEFAULT_SETTINGS: TaskTrackerSettings = {
  tasksFolder: 'Tasks',
  idPrefix: 'TASK',
  authorName: 'Me',
  schema: DEFAULT_SCHEMA,
  statusFieldKey: 'status',
  doneStatuses: ['Done'],
  dueFieldKey: 'due',
};

export function mergeSettings(saved: unknown): TaskTrackerSettings {
  if (saved === null || typeof saved !== 'object') return { ...DEFAULT_SETTINGS };
  const s = saved as Partial<TaskTrackerSettings>;

  const schema =
    Array.isArray(s.schema) && s.schema.length > 0 ? s.schema : DEFAULT_SETTINGS.schema;

  return {
    ...DEFAULT_SETTINGS,
    ...s,
    schema,
  };
}
