import type { FieldDef, FieldType } from '../schema/types';
import { sortedSchema, validateFieldDef } from '../schema/validate';
import type { ProjectScope, TaskTrackerSettings } from './types';

/** Frontmatter key that marks a note as a project's settings file; its value is the name. */
export const PROJECT_MARKER = 'tt-project';

const SETTINGS_FILE = 'Settings/project.md';
const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'person'];

export function isProjectFilePath(path: string): boolean {
  return path === SETTINGS_FILE || path.endsWith(`/${SETTINGS_FILE}`);
}

/** The folder holding `Settings/` -- the project's root. '' at the vault root. */
export function projectRoot(filePath: string): string {
  return filePath === SETTINGS_FILE ? '' : filePath.slice(0, -(SETTINGS_FILE.length + 1));
}

export function projectFilePath(root: string): string {
  return root === '' ? SETTINGS_FILE : `${root}/${SETTINGS_FILE}`;
}

export function parentOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf('/'), 0));
}

function trimSlashes(s: string): string {
  return s.trim().replace(/^\/+|\/+$/g, '');
}

/** `rel` is relative to `root`, or a vault path when it starts with "/". */
export function resolveTasksFolder(root: string, rel: string): string {
  if (rel.trim().startsWith('/')) return trimSlashes(rel);
  const r = trimSlashes(rel) || 'Tasks';
  return root === '' ? r : `${root}/${r}`;
}

/** Inverse of resolveTasksFolder. */
export function relativeTasksFolder(root: string, folder: string): string {
  if (root === '') return folder;
  return folder.startsWith(`${root}/`) ? folder.slice(root.length + 1) : `/${folder}`;
}

/** The scope for tasks without a project, straight from plugin settings. */
export function noProjectScope(s: TaskTrackerSettings): ProjectScope {
  return {
    name: null,
    filePath: null,
    idPrefix: s.idPrefix,
    tasksFolder: s.tasksFolder,
    schema: s.schema,
    statusFieldKey: s.statusFieldKey,
    doneStatuses: s.doneStatuses,
    dueFieldKey: s.dueFieldKey,
  };
}

/** One `fields` entry, or a message saying why it can't be used. */
function parseField(raw: unknown, index: number): FieldDef | string {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return `Field #${index + 1} is not a key/value entry.`;
  }
  const r = raw as Record<string, unknown>;
  const key = typeof r.key === 'string' ? r.key.trim() : '';
  if (key === '') return `Field #${index + 1} has no key.`;
  if (typeof r.type !== 'string' || !FIELD_TYPES.includes(r.type as FieldType)) {
    return `Field "${key}" has an unknown type ${JSON.stringify(r.type)}.`;
  }
  const label = typeof r.label === 'string' && r.label.trim() !== '' ? r.label.trim() : key;
  const def: FieldDef = { key, label, type: r.type as FieldType, order: 0 };
  if (Array.isArray(r.options)) {
    def.options = r.options.filter((o) => o !== null && o !== undefined).map(String);
  }
  if (r.required === true) def.required = true;
  if (r.showInList === true) def.showInList = true;
  return def;
}

export interface ParsedProject {
  project: ProjectScope | null;
  warnings: string[];
}

/**
 * Read a project from its settings file's frontmatter. Files without the
 * marker are not projects and produce no warnings. Anything else broken is
 * skipped with a warning, so a hand-edit mistake costs one field, not the
 * whole project.
 */
export function parseProjectFile(path: string, fm: Record<string, unknown> | null): ParsedProject {
  const rawName = fm?.[PROJECT_MARKER];
  if (fm === null || rawName === undefined) return { project: null, warnings: [] };

  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (name === '') {
    return { project: null, warnings: [`"${PROJECT_MARKER}" must be the project's name.`] };
  }
  const idPrefix = typeof fm.idPrefix === 'string' ? fm.idPrefix.trim() : '';
  if (idPrefix === '') return { project: null, warnings: ['"idPrefix" is missing.'] };

  const warnings: string[] = [];
  const schema: FieldDef[] = [];
  if (Array.isArray(fm.fields)) {
    fm.fields.forEach((raw: unknown, i: number) => {
      const parsed = parseField(raw, i);
      if (typeof parsed === 'string') {
        warnings.push(`${parsed} Skipped.`);
        return;
      }
      const errors = validateFieldDef(parsed, schema);
      if (errors.length > 0) {
        warnings.push(`Field "${parsed.key}" skipped: ${errors.join(' ')}`);
        return;
      }
      schema.push({ ...parsed, order: schema.length });
    });
  } else {
    warnings.push('"fields" is missing, so this project has no fields.');
  }

  const has = (key: unknown, type?: FieldType) =>
    schema.some((f) => f.key === key && (type === undefined || f.type === type));

  let statusFieldKey = 'status';
  if (fm.statusField !== undefined) {
    if (typeof fm.statusField === 'string' && has(fm.statusField)) statusFieldKey = fm.statusField;
    else warnings.push('"statusField" names no field; using "status".');
  }

  const doneStatuses = Array.isArray(fm.doneStatuses) ? fm.doneStatuses.map(String) : ['Done'];

  let dueFieldKey: string | null = has('due', 'date') ? 'due' : null;
  if (fm.dueField === null) {
    dueFieldKey = null;
  } else if (fm.dueField !== undefined) {
    if (typeof fm.dueField === 'string' && has(fm.dueField, 'date')) {
      dueFieldKey = fm.dueField;
    } else {
      warnings.push(
        `"dueField" names no date field; using ${dueFieldKey === null ? 'none' : `"${dueFieldKey}"`}.`,
      );
    }
  }

  const tasksFolder = resolveTasksFolder(
    projectRoot(path),
    typeof fm.tasksFolder === 'string' ? fm.tasksFolder : 'Tasks',
  );

  return {
    project: {
      name, filePath: path, idPrefix, tasksFolder, schema, statusFieldKey, doneStatuses, dueFieldKey,
    },
    warnings,
  };
}

/** The frontmatter keys this plugin owns, for writing a scope back to its file. */
export function serializeProjectFrontmatter(scope: ProjectScope): Record<string, unknown> {
  const root = scope.filePath === null ? '' : projectRoot(scope.filePath);
  return {
    [PROJECT_MARKER]: scope.name ?? '',
    idPrefix: scope.idPrefix,
    tasksFolder: relativeTasksFolder(root, scope.tasksFolder),
    statusField: scope.statusFieldKey,
    doneStatuses: [...scope.doneStatuses],
    dueField: scope.dueFieldKey,
    fields: sortedSchema(scope.schema).map((f) => {
      const out: Record<string, unknown> = { key: f.key, label: f.label, type: f.type };
      if (f.options && f.options.length > 0) out.options = [...f.options];
      if (f.required) out.required = true;
      if (f.showInList) out.showInList = true;
      return out;
    }),
  };
}
