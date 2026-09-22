import type { FieldDef } from '../schema/types';
import type { ProjectDef, TaskTrackerSettings } from './types';

/** Frontmatter key carrying the project name on a task. */
export const PROJECT_KEY = 'project';

/** Derive a suggested ID prefix from a project name: alphanumeric, uppercase. */
export function suggestPrefix(name: string): string {
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 10) : 'PROJ';
}

/**
 * Ensure a `project` select field exists whose options cover every project.
 * Tasks store the project name under this key, so without a matching schema
 * field the value is invisible in the UI and flagged as an orphan.
 */
export function ensureProjectField(schema: FieldDef[], projects: ProjectDef[]): FieldDef[] {
  const names = [...new Set(projects.map((p) => p.name).filter((n) => n.length > 0))];
  const existing = schema.find((f) => f.key === PROJECT_KEY);

  if (!existing) {
    if (names.length === 0) return schema;
    const order = schema.reduce((max, f) => Math.max(max, f.order), -1) + 1;
    const def: FieldDef = {
      key: PROJECT_KEY,
      label: 'Project',
      type: 'select',
      options: names,
      showInList: true,
      order,
    };
    return [...schema, def];
  }

  const current = existing.options ?? [];
  const options = [...new Set([...current, ...names])];
  if (options.length === current.length && names.every((n) => current.includes(n))) return schema;
  return schema.map((f) =>
    f.key === PROJECT_KEY
      ? { ...f, type: 'select' as const, options: [...new Set([...(f.options ?? []), ...names])] }
      : f,
  );
}

/** Resolve the ID prefix for a task being created under `projectName`. */
export function prefixForProject(
  settings: TaskTrackerSettings,
  projectName: string,
): string | undefined {
  if (projectName.length === 0) return undefined;
  return settings.projects.find((p) => p.name === projectName)?.idPrefix;
}
