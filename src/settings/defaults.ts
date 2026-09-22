import { DEFAULT_SCHEMA } from '../schema/defaults';
import type { TaskTrackerSettings } from './types';

export const DEFAULT_SETTINGS: TaskTrackerSettings = {
  tasksFolder: 'Tasks',
  idPrefix: 'TASK',
  projects: [],
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

  const projects = Array.isArray(s.projects)
    ? s.projects.filter(
        (p): p is { name: string; idPrefix: string } =>
          p !== null &&
          typeof p === 'object' &&
          typeof p.name === 'string' &&
          typeof p.idPrefix === 'string' &&
          p.name.length > 0,
      )
    : [];

  return {
    ...DEFAULT_SETTINGS,
    ...s,
    schema,
    projects,
  };
}
