import type { Task } from '../model/types';
import { PROJECT_KEY } from './projects';
import type { ProjectScope } from './types';

/**
 * Frontmatter keys no field claims, mapped to the tasks carrying them. Each
 * task is checked against its own project's fields, so one project's fields
 * are never orphans just because another project lacks them.
 */
export function orphanKeys(
  tasks: Task[],
  scopeForPath: (path: string) => ProjectScope,
): Map<string, string[]> {
  const orphans = new Map<string, string[]>();
  for (const task of tasks) {
    const scope = scopeForPath(task.path);
    // A field whose entry the settings note got wrong is still that project's field.
    const skipped = (scope.skippedFields ?? []).map(({ raw }) =>
      raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>).key : undefined);
    const known = new Set<unknown>([PROJECT_KEY, ...scope.schema.map((f) => f.key), ...skipped]);
    // task.fields already excludes id, title, created and updated.
    for (const key of Object.keys(task.fields)) {
      if (known.has(key)) continue;
      orphans.set(key, [...(orphans.get(key) ?? []), task.path]);
    }
  }
  return orphans;
}
