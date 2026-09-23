# Project Settings Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each project is defined by `<root>/Settings/project.md` (frontmatter)
with its own fields, and the tracker view switches between projects.

**Architecture:** A pure `projectFile.ts` parses and serializes the
frontmatter. A pure `ProjectRegistry`, fed by Obsidian's metadata cache,
holds the current `ProjectScope` for each file and supplies the task index's
folder list. The view keeps a current project in its `Store` and reads
fields, statuses and folder from `registry.scopeFor(project)`. A one-time
migration turns legacy `settings.projects` into files.

**Tech Stack:** TypeScript, Preact, Obsidian API, vitest (node environment,
no `obsidian` module available in tests).

**Spec:** `docs/superpowers/specs/2026-09-23-project-settings-files-design.md`

## Global Constraints

- Modules under test (`src/settings/projectFile.ts`, `projectRegistry.ts`,
  `migrate.ts`, `src/ui/store.ts`) must not import `obsidian`. Tests run in
  node without it.
- Lint rules from `eslint-plugin-obsidianmd` apply to every changed file.
  Don't assign `el.style.*` (use `setCssProps` or CSS classes), and write
  UI text in sentence case. Check with `npx eslint <changed files>`, which
  must print no errors. `npm run lint` already fails on files this plan
  doesn't touch, so don't use it as the gate.
- Verification commands: `npm test`, `npm run typecheck`, `npm run build`.
- Settings file location: `<root>/Settings/project.md`. The marker key is
  `tt-project`.
- `tasksFolder` in the file is relative to the root. A leading `/` makes it
  a vault path. This extends the spec to cover legacy folders that have no
  parent folder.
- Frontmatter writes go through `VaultAdapter.processFrontmatter` so the
  note body and any unknown keys are kept.
- Frontmatter key `project` (`PROJECT_KEY`) is still written on project
  tasks, and the detail pane never shows it.
- Commits: one per task, with the attribution trailer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A hand-edited `project.md` with a mistake** (an entry in `fields`
   with no key, an unknown type, `options` given as a single string, or
   `fields` missing): the project still loads with its valid fields, and
   each problem is listed as a warning. Tested in Task 1.
2. **Renaming a project's folder in the file explorer:** the old path
   drops out, the new path is picked up, and the project name from
   `tt-project` doesn't change, so the switcher selection survives. Tested
   in Task 2 (`remove` then `update`).
3. **Legacy projects with no parent folder (`Web Tasks`) or two sharing a
   parent (`Work/A`, `Work/B`):** migration must not skip the second
   project or write `Settings/project.md` at the vault root. Tested in
   Task 3.
4. **"Clean up orphaned frontmatter keys" in plugin settings:** it must not
   treat a project's own fields as orphans and delete them. Fixed and
   checked in Task 6.
5. **Typing in the project settings form while each save comes back
   through the metadata cache:** the form must not redraw under the cursor
   and lose focus or text. Checked by hand in Task 8.

---

### Task 0: Branch

- [ ] **Step 1: Create the feature branch and commit the earlier UI fixes**

The working tree already holds the picker and title fixes
(`src/ui/MultiPicker.tsx`, `src/ui/TaskDetail.tsx`, `styles.css`).

```bash
git checkout -b project-settings-files
git add src/ui/MultiPicker.tsx src/ui/TaskDetail.tsx styles.css
git commit -m "Keep pickers inside their pane; wrap long titles in the detail pane

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add docs/superpowers
git commit -m "Add project settings files spec and plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Project file parse / serialize

**Files:**
- Modify: `src/settings/types.ts` (add `ProjectScope`)
- Create: `src/settings/projectFile.ts`
- Test: `tests/settings/projectFile.test.ts`

**Interfaces:**
- Produces:
  - `ProjectScope` (in `src/settings/types.ts`)
  - `PROJECT_MARKER`
  - `isProjectFilePath(path: string): boolean`
  - `projectRoot(filePath: string): string`
  - `projectFilePath(root: string): string`
  - `parentOf(path: string): string`
  - `resolveTasksFolder(root: string, rel: string): string`
  - `relativeTasksFolder(root: string, folder: string): string`
  - `noProjectScope(s: TaskTrackerSettings): ProjectScope`
  - `parseProjectFile(path: string, fm: Record<string, unknown> | null): { project: ProjectScope | null; warnings: string[] }`
  - `serializeProjectFrontmatter(scope: ProjectScope): Record<string, unknown>`

- [ ] **Step 1: Add `ProjectScope` to `src/settings/types.ts`** (append):

```ts
/**
 * Everything the view needs to show one project's tasks: its fields,
 * statuses, ID prefix and folder. "No project" is a scope too, built from
 * plugin settings.
 */
export interface ProjectScope {
  /** Null for "No project". */
  name: string | null;
  /** The project's `Settings/project.md`, or null for "No project". */
  filePath: string | null;
  idPrefix: string;
  /** Vault-relative folder holding the project's tasks. */
  tasksFolder: string;
  schema: FieldDef[];
  statusFieldKey: string;
  doneStatuses: string[];
  dueFieldKey: string | null;
}
```

- [ ] **Step 2: Write the failing tests** in `tests/settings/projectFile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isProjectFilePath, noProjectScope, parentOf, parseProjectFile, projectFilePath, projectRoot,
  relativeTasksFolder, resolveTasksFolder, serializeProjectFrontmatter,
} from '../../src/settings/projectFile';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';

const STATUS = { key: 'status', label: 'Status', type: 'select', options: ['To Do', 'Done'] };

describe('paths', () => {
  it('recognises Settings/project.md at any depth', () => {
    expect(isProjectFilePath('Alpha/Settings/project.md')).toBe(true);
    expect(isProjectFilePath('Work/Alpha/Settings/project.md')).toBe(true);
    expect(isProjectFilePath('Settings/project.md')).toBe(true);
    expect(isProjectFilePath('Alpha/Settings/other.md')).toBe(false);
    expect(isProjectFilePath('Alpha/MySettings/project.md')).toBe(false);
  });

  it('derives the root and back', () => {
    expect(projectRoot('Work/Alpha/Settings/project.md')).toBe('Work/Alpha');
    expect(projectRoot('Settings/project.md')).toBe('');
    expect(projectFilePath('Work/Alpha')).toBe('Work/Alpha/Settings/project.md');
    expect(projectFilePath('')).toBe('Settings/project.md');
  });

  it('parentOf returns the containing folder', () => {
    expect(parentOf('A/B/c.md')).toBe('A/B');
    expect(parentOf('c.md')).toBe('');
  });

  it('resolves tasksFolder relative to the root, or as a vault path with a leading slash', () => {
    expect(resolveTasksFolder('Alpha', 'Tasks')).toBe('Alpha/Tasks');
    expect(resolveTasksFolder('Alpha', ' /Shared/Tasks/ ')).toBe('Shared/Tasks');
    expect(resolveTasksFolder('Alpha', '')).toBe('Alpha/Tasks');
    expect(resolveTasksFolder('', 'Tasks')).toBe('Tasks');
    expect(relativeTasksFolder('Alpha', 'Alpha/Tasks')).toBe('Tasks');
    expect(relativeTasksFolder('Alpha', 'Shared/Tasks')).toBe('/Shared/Tasks');
  });
});

describe('parseProjectFile', () => {
  it('ignores a file without the marker, silently', () => {
    expect(parseProjectFile('A/Settings/project.md', { title: 'x' })).toEqual({ project: null, warnings: [] });
    expect(parseProjectFile('A/Settings/project.md', null)).toEqual({ project: null, warnings: [] });
  });

  it('rejects a marked file without a name or prefix, with a warning', () => {
    const noName = parseProjectFile('A/Settings/project.md', { 'tt-project': '', idPrefix: 'A' });
    expect(noName.project).toBeNull();
    expect(noName.warnings).toHaveLength(1);
    const noPrefix = parseProjectFile('A/Settings/project.md', { 'tt-project': 'Alpha' });
    expect(noPrefix.project).toBeNull();
    expect(noPrefix.warnings[0]).toContain('idPrefix');
  });

  it('parses a full file', () => {
    const { project, warnings } = parseProjectFile('Work/Alpha/Settings/project.md', {
      'tt-project': 'Alpha',
      idPrefix: 'ALP',
      tasksFolder: 'Issues',
      statusField: 'status',
      doneStatuses: ['Done'],
      dueField: 'due',
      fields: [STATUS, { key: 'due', label: 'Due', type: 'date', showInList: true }],
    });
    expect(warnings).toEqual([]);
    expect(project).toEqual({
      name: 'Alpha',
      filePath: 'Work/Alpha/Settings/project.md',
      idPrefix: 'ALP',
      tasksFolder: 'Work/Alpha/Issues',
      schema: [
        { key: 'status', label: 'Status', type: 'select', options: ['To Do', 'Done'], order: 0 },
        { key: 'due', label: 'Due', type: 'date', showInList: true, order: 1 },
      ],
      statusFieldKey: 'status',
      doneStatuses: ['Done'],
      dueFieldKey: 'due',
    });
  });

  it('applies defaults for optional keys', () => {
    const { project } = parseProjectFile('Alpha/Settings/project.md', {
      'tt-project': 'Alpha', idPrefix: 'ALP', fields: [STATUS],
    });
    expect(project?.tasksFolder).toBe('Alpha/Tasks');
    expect(project?.statusFieldKey).toBe('status');
    expect(project?.doneStatuses).toEqual(['Done']);
    expect(project?.dueFieldKey).toBeNull();
  });

  it('skips broken fields but keeps the valid ones', () => {
    const { project, warnings } = parseProjectFile('Alpha/Settings/project.md', {
      'tt-project': 'Alpha',
      idPrefix: 'ALP',
      fields: [
        STATUS,
        { label: 'No key', type: 'text' },
        { key: 'x', type: 'colour' },
        'nonsense',
        { key: 'status', label: 'Again', type: 'text' },
        { key: 'sprint', label: 'Sprint', type: 'multiselect', options: 'S1' },
      ],
    });
    expect(project?.schema.map((f) => f.key)).toEqual(['status', 'sprint']);
    expect(project?.schema[1].options).toBeUndefined();
    expect(warnings).toHaveLength(4);
  });

  it('warns when fields are missing', () => {
    const { project, warnings } = parseProjectFile('Alpha/Settings/project.md', {
      'tt-project': 'Alpha', idPrefix: 'ALP',
    });
    expect(project?.schema).toEqual([]);
    expect(warnings[0]).toContain('fields');
  });

  it('warns about status/due fields that do not exist and falls back', () => {
    const { project, warnings } = parseProjectFile('Alpha/Settings/project.md', {
      'tt-project': 'Alpha', idPrefix: 'ALP', statusField: 'state', dueField: 'deadline',
      fields: [STATUS],
    });
    expect(project?.statusFieldKey).toBe('status');
    expect(project?.dueFieldKey).toBeNull();
    expect(warnings).toHaveLength(2);
  });

  it('treats an explicit null dueField as "no due badge"', () => {
    const { project, warnings } = parseProjectFile('Alpha/Settings/project.md', {
      'tt-project': 'Alpha', idPrefix: 'ALP', dueField: null,
      fields: [STATUS, { key: 'due', label: 'Due', type: 'date' }],
    });
    expect(project?.dueFieldKey).toBeNull();
    expect(warnings).toEqual([]);
  });
});

describe('serializeProjectFrontmatter', () => {
  it('round-trips through parseProjectFile', () => {
    const { project } = parseProjectFile('Work/Alpha/Settings/project.md', {
      'tt-project': 'Alpha', idPrefix: 'ALP', tasksFolder: '/Shared/Alpha', dueField: 'due',
      doneStatuses: ['Done', 'Won\'t do'],
      fields: [STATUS, { key: 'due', label: 'Due', type: 'date', required: true }],
    });
    if (!project) throw new Error('expected a project');
    const fm = serializeProjectFrontmatter(project);
    expect(fm.tasksFolder).toBe('/Shared/Alpha');
    expect(parseProjectFile(project.filePath as string, fm)).toEqual({ project, warnings: [] });
  });
});

describe('noProjectScope', () => {
  it('is built from plugin settings', () => {
    const s = noProjectScope(DEFAULT_SETTINGS);
    expect(s.name).toBeNull();
    expect(s.filePath).toBeNull();
    expect(s.tasksFolder).toBe('Tasks');
    expect(s.schema).toBe(DEFAULT_SETTINGS.schema);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `npx vitest run tests/settings/projectFile.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/settings/projectFile".

- [ ] **Step 4: Implement `src/settings/projectFile.ts`:**

```ts
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
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/settings/projectFile.test.ts && npm run typecheck`
Expected: all pass, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/settings/types.ts src/settings/projectFile.ts tests/settings/projectFile.test.ts
git commit -m "Parse and serialize project settings files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ProjectRegistry

**Files:**
- Create: `src/settings/projectRegistry.ts`
- Test: `tests/settings/projectRegistry.test.ts`

**Interfaces:**
- Consumes: from Task 1, `parseProjectFile`, `isProjectFilePath`,
  `noProjectScope`, `parentOf` and `ProjectScope`.
- Produces:
  - `ProjectFileSource { markdownPaths(): string[]; frontmatterOf(path): Record<string, unknown> | null }`
  - `ProjectWarning { filePath: string; message: string }`
  - `class ProjectRegistry(source, settings: () => TaskTrackerSettings)`, with:
    - `rebuild(): void`
    - `update(path): boolean`
    - `remove(path): boolean`
    - `onChange(cb): () => void`
    - `all(): ProjectScope[]`
    - `get(name): ProjectScope | undefined`
    - `scopeFor(name: string | null): ProjectScope`
    - `scopeForPath(taskPath): ProjectScope`
    - `taskFolders(): string[]`
    - `warningsFor(name: string | null): ProjectWarning[]`

- [ ] **Step 1: Write the failing tests** in `tests/settings/projectRegistry.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectRegistry, type ProjectFileSource } from '../../src/settings/projectRegistry';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';

class FakeSource implements ProjectFileSource {
  files = new Map<string, Record<string, unknown> | null>();
  markdownPaths() { return [...this.files.keys()]; }
  frontmatterOf(path: string) { return this.files.get(path) ?? null; }
}

const STATUS = { key: 'status', label: 'Status', type: 'select', options: ['To Do', 'Done'] };
const project = (name: string, idPrefix: string, extra: Record<string, unknown> = {}) =>
  ({ 'tt-project': name, idPrefix, fields: [STATUS], ...extra });

let source: FakeSource;
let registry: ProjectRegistry;

beforeEach(() => {
  source = new FakeSource();
  source.files.set('Beta/Settings/project.md', project('Beta', 'BET'));
  source.files.set('Alpha/Settings/project.md', project('Alpha', 'ALP'));
  source.files.set('Notes/Settings/project.md', { title: 'not a project' });
  source.files.set('Alpha/Tasks/ALP-1 A.md', { id: 'ALP-1' });
  registry = new ProjectRegistry(source, () => DEFAULT_SETTINGS);
  registry.rebuild();
});

describe('ProjectRegistry', () => {
  it('finds marked settings files, sorted by name', () => {
    expect(registry.all().map((p) => p.name)).toEqual(['Alpha', 'Beta']);
  });

  it('scans the default folder plus each project folder', () => {
    expect(registry.taskFolders()).toEqual(['Tasks', 'Alpha/Tasks', 'Beta/Tasks']);
  });

  it('scopeFor falls back to "No project" for null or an unknown name', () => {
    expect(registry.scopeFor('Alpha').idPrefix).toBe('ALP');
    expect(registry.scopeFor(null).name).toBeNull();
    expect(registry.scopeFor('Gone').name).toBeNull();
    expect(registry.scopeFor(null).tasksFolder).toBe('Tasks');
  });

  it('scopeForPath picks the project whose tasks folder holds the task', () => {
    expect(registry.scopeForPath('Alpha/Tasks/ALP-1 A.md').name).toBe('Alpha');
    expect(registry.scopeForPath('Tasks/TASK-1 A.md').name).toBeNull();
  });

  it('update re-reads a settings file and reports it; other files are ignored', () => {
    const cb = vi.fn();
    registry.onChange(cb);
    source.files.set('Alpha/Settings/project.md', project('Alpha', 'AL2'));
    expect(registry.update('Alpha/Settings/project.md')).toBe(true);
    expect(registry.get('Alpha')?.idPrefix).toBe('AL2');
    expect(registry.update('Alpha/Tasks/ALP-1 A.md')).toBe(false);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('picks up a newly created settings file', () => {
    source.files.set('Gamma/Settings/project.md', project('Gamma', 'GAM'));
    registry.update('Gamma/Settings/project.md');
    expect(registry.get('Gamma')?.tasksFolder).toBe('Gamma/Tasks');
  });

  it('follows a folder rename: remove old path, update new path, same name', () => {
    source.files.delete('Alpha/Settings/project.md');
    source.files.set('Renamed/Settings/project.md', project('Alpha', 'ALP'));
    expect(registry.remove('Alpha/Settings/project.md')).toBe(true);
    registry.update('Renamed/Settings/project.md');
    expect(registry.get('Alpha')?.tasksFolder).toBe('Renamed/Tasks');
    expect(registry.all()).toHaveLength(2);
  });

  it('remove returns false for a path it does not know', () => {
    expect(registry.remove('Alpha/Tasks/ALP-1 A.md')).toBe(false);
  });

  it('reports parse warnings for a project', () => {
    source.files.set('Alpha/Settings/project.md', project('Alpha', 'ALP', { fields: [STATUS, { key: 'x' }] }));
    registry.update('Alpha/Settings/project.md');
    expect(registry.warningsFor('Alpha')).toEqual([
      { filePath: 'Alpha/Settings/project.md', message: expect.stringContaining('"x"') },
    ]);
  });

  it('reports marked-but-unusable files under "No project"', () => {
    source.files.set('Broken/Settings/project.md', { 'tt-project': 'Broken' });
    registry.update('Broken/Settings/project.md');
    expect(registry.get('Broken')).toBeUndefined();
    expect(registry.warningsFor(null).map((w) => w.filePath)).toEqual(['Broken/Settings/project.md']);
  });

  it('warns about a shared ID prefix on both projects', () => {
    source.files.set('Beta/Settings/project.md', project('Beta', 'ALP'));
    registry.update('Beta/Settings/project.md');
    expect(registry.warningsFor('Alpha')).toEqual([
      { filePath: 'Beta/Settings/project.md', message: 'Also uses the ID prefix "ALP".' },
    ]);
    expect(registry.warningsFor('Beta')[0].filePath).toBe('Alpha/Settings/project.md');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/settings/projectRegistry.test.ts`
Expected: FAIL, "Failed to resolve import".

- [ ] **Step 3: Implement `src/settings/projectRegistry.ts`:**

```ts
import { isProjectFilePath, noProjectScope, parentOf, parseProjectFile } from './projectFile';
import type { ProjectScope, TaskTrackerSettings } from './types';

/** The metadata slice the registry needs. Backed by Obsidian's metadataCache. */
export interface ProjectFileSource {
  /** Every markdown path in the vault. */
  markdownPaths(): string[];
  frontmatterOf(path: string): Record<string, unknown> | null;
}

export interface ProjectWarning {
  /** The settings file the warning is about. */
  filePath: string;
  message: string;
}

/**
 * Every project defined by a `Settings/project.md` in the vault. The vault
 * is the source of truth: this only mirrors what the files say.
 */
export class ProjectRegistry {
  private projects = new Map<string, ProjectScope>();
  private fileWarnings = new Map<string, string[]>();
  private listeners = new Set<() => void>();

  constructor(
    private source: ProjectFileSource,
    private settings: () => TaskTrackerSettings,
  ) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners) cb();
  }

  private load(path: string): void {
    this.projects.delete(path);
    this.fileWarnings.delete(path);
    const { project, warnings } = parseProjectFile(path, this.source.frontmatterOf(path));
    if (project) this.projects.set(path, project);
    if (warnings.length > 0) this.fileWarnings.set(path, warnings);
  }

  rebuild(): void {
    this.projects.clear();
    this.fileWarnings.clear();
    for (const path of this.source.markdownPaths()) {
      if (isProjectFilePath(path)) this.load(path);
    }
    this.emit();
  }

  /** Re-read one file. True when it is a settings-file path (handled here). */
  update(path: string): boolean {
    if (!isProjectFilePath(path)) return false;
    this.load(path);
    this.emit();
    return true;
  }

  /** Forget one file. True when it was a known settings file. */
  remove(path: string): boolean {
    const known = this.projects.delete(path) || this.fileWarnings.delete(path);
    this.fileWarnings.delete(path);
    if (known) this.emit();
    return known;
  }

  all(): ProjectScope[] {
    return [...this.projects.values()].sort((a, b) =>
      (a.name ?? '').localeCompare(b.name ?? '') || (a.filePath ?? '').localeCompare(b.filePath ?? ''));
  }

  get(name: string): ProjectScope | undefined {
    return this.all().find((p) => p.name === name);
  }

  scopeFor(name: string | null): ProjectScope {
    const project = name === null ? undefined : this.get(name);
    return project ?? noProjectScope(this.settings());
  }

  scopeForPath(taskPath: string): ProjectScope {
    const folder = parentOf(taskPath);
    return this.all().find((p) => p.tasksFolder === folder) ?? noProjectScope(this.settings());
  }

  /** Folders the task index scans: the default one, then one per project. */
  taskFolders(): string[] {
    return [...new Set([this.settings().tasksFolder, ...this.all().map((p) => p.tasksFolder)])];
  }

  /**
   * Problems to show while `name` is the current project. "No project"
   * collects files that are marked as projects but could not be loaded.
   */
  warningsFor(name: string | null): ProjectWarning[] {
    const out: ProjectWarning[] = [];
    if (name === null) {
      for (const [filePath, messages] of this.fileWarnings) {
        if (this.projects.has(filePath)) continue;
        for (const message of messages) out.push({ filePath, message });
      }
      return out;
    }
    const project = this.get(name);
    if (!project || project.filePath === null) return out;
    for (const message of this.fileWarnings.get(project.filePath) ?? []) {
      out.push({ filePath: project.filePath, message });
    }
    for (const other of this.all()) {
      if (other.filePath === null || other.filePath === project.filePath) continue;
      if (other.idPrefix === project.idPrefix) {
        out.push({ filePath: other.filePath, message: `Also uses the ID prefix "${project.idPrefix}".` });
      }
      if (other.name === project.name) {
        out.push({ filePath: other.filePath, message: `Also named "${name}"; only one of them can be opened.` });
      }
    }
    return out;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/settings/projectRegistry.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings/projectRegistry.ts tests/settings/projectRegistry.test.ts
git commit -m "Add a registry of projects defined by settings files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Migration of legacy projects

**Files:**
- Create: `src/settings/migrate.ts`
- Test: `tests/settings/migrate.test.ts`

**Interfaces:**
- Consumes:
  - `projectFolder(p)` and `PROJECT_KEY` from `src/settings/projects.ts`
    (both exist now)
  - `projectFilePath`, `parentOf` and `serializeProjectFrontmatter` from
    Task 1
  - `VaultAdapter` from `src/write/vault.ts`
- Produces:
  - `PROJECT_FILE_BODY: string`
  - `writeProjectFile(vault: VaultAdapter, filePath: string, scope: ProjectScope): Promise<void>`
  - `migrateLegacyProjects(vault, settings): Promise<{ created: string[]; skipped: string[]; failed: string[] }>`
  - `withoutLegacyProjects(settings): TaskTrackerSettings`, which returns
    the settings without `projects` and without the `project` field

- [ ] **Step 1: Write the failing tests** in `tests/settings/migrate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  PROJECT_FILE_BODY, migrateLegacyProjects, withoutLegacyProjects,
} from '../../src/settings/migrate';
import { parseProjectFile } from '../../src/settings/projectFile';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import type { VaultAdapter } from '../../src/write/vault';
import type { TaskTrackerSettings } from '../../src/settings/types';

/** Keeps frontmatter as an object beside the body, like Obsidian's parsed view. */
class FakeVault implements VaultAdapter {
  bodies = new Map<string, string>();
  fm = new Map<string, Record<string, unknown>>();
  failOn = new Set<string>();
  async read(p: string) { return this.bodies.get(p) ?? ''; }
  async write(p: string, c: string) { this.bodies.set(p, c); }
  async create(p: string, c: string) {
    if (this.failOn.has(p)) throw new Error('disk full');
    if (this.bodies.has(p)) throw new Error('exists');
    this.bodies.set(p, c);
  }
  async rename() { throw new Error('unused'); }
  async exists(p: string) { return this.bodies.has(p); }
  async list() { return []; }
  async processFrontmatter(p: string, mutate: (fm: Record<string, unknown>) => void) {
    const fm = { ...(this.fm.get(p) ?? {}) };
    mutate(fm);
    this.fm.set(p, fm);
  }
}

const withProjects = (projects: TaskTrackerSettings['projects']): TaskTrackerSettings => ({
  ...DEFAULT_SETTINGS,
  projects,
  schema: [
    ...DEFAULT_SETTINGS.schema,
    { key: 'project', label: 'Project', type: 'select', options: ['Alpha'], order: 99 },
  ],
});

describe('migrateLegacyProjects', () => {
  it('writes a settings file beside each project folder', async () => {
    const vault = new FakeVault();
    const settings = withProjects([{ name: 'Alpha', idPrefix: 'ALP' }]);
    const result = await migrateLegacyProjects(vault, settings);
    expect(result).toEqual({ created: ['Alpha/Settings/project.md'], skipped: [], failed: [] });
    expect(vault.bodies.get('Alpha/Settings/project.md')).toBe(PROJECT_FILE_BODY);
    const { project, warnings } = parseProjectFile('Alpha/Settings/project.md', vault.fm.get('Alpha/Settings/project.md') ?? null);
    expect(warnings).toEqual([]);
    expect(project?.idPrefix).toBe('ALP');
    expect(project?.tasksFolder).toBe('Alpha/Tasks');
    expect(project?.schema.map((f) => f.key)).not.toContain('project');
    expect(project?.schema).toHaveLength(DEFAULT_SETTINGS.schema.length);
  });

  it('never overwrites an existing settings file', async () => {
    const vault = new FakeVault();
    vault.bodies.set('Alpha/Settings/project.md', 'mine');
    const result = await migrateLegacyProjects(vault, withProjects([{ name: 'Alpha', idPrefix: 'ALP' }]));
    expect(result.skipped).toEqual(['Alpha/Settings/project.md']);
    expect(vault.bodies.get('Alpha/Settings/project.md')).toBe('mine');
  });

  it('gives a project with no parent folder its own root, pointing back at its tasks', async () => {
    const vault = new FakeVault();
    const result = await migrateLegacyProjects(vault, withProjects([{ name: 'Web', idPrefix: 'WEB', folder: 'Web Tasks' }]));
    expect(result.created).toEqual(['Web/Settings/project.md']);
    expect(vault.fm.get('Web/Settings/project.md')?.tasksFolder).toBe('/Web Tasks');
  });

  it('does not let two projects under one parent share a settings file', async () => {
    const vault = new FakeVault();
    const result = await migrateLegacyProjects(vault, withProjects([
      { name: 'A', idPrefix: 'A', folder: 'Work/A' },
      { name: 'B', idPrefix: 'B', folder: 'Work/B' },
    ]));
    expect(result.created).toEqual(['Work/Settings/project.md', 'B/Settings/project.md']);
    const b = parseProjectFile('B/Settings/project.md', vault.fm.get('B/Settings/project.md') ?? null);
    expect(b.project?.tasksFolder).toBe('Work/B');
  });

  it('reports failures without stopping the rest', async () => {
    const vault = new FakeVault();
    vault.failOn.add('Alpha/Settings/project.md');
    const result = await migrateLegacyProjects(vault, withProjects([
      { name: 'Alpha', idPrefix: 'ALP' },
      { name: 'Beta', idPrefix: 'BET' },
    ]));
    expect(result.failed).toEqual(['Alpha: disk full']);
    expect(result.created).toEqual(['Beta/Settings/project.md']);
  });
});

describe('withoutLegacyProjects', () => {
  it('drops the project list and the global project field', () => {
    const next = withoutLegacyProjects(withProjects([{ name: 'Alpha', idPrefix: 'ALP' }]));
    expect(next.projects).toBeUndefined();
    expect(next.schema.some((f) => f.key === 'project')).toBe(false);
  });
});
```

- [ ] **Step 2: Make `projects` optional so the tests compile**

This is needed for `next.projects` to be `undefined` and for
`TaskTrackerSettings['projects']`.

In `src/settings/types.ts`, rename `ProjectDef` to `LegacyProject`. Keep
its body and replace its doc comment with:
`/** A project as plugin settings stored it before settings files. Only read by migration. */`.
Then change the settings field:

```ts
  /**
   * Legacy project list. Present only until migrateLegacyProjects() has
   * moved each entry into its own Settings/project.md.
   */
  projects?: LegacyProject[];
```

In `src/settings/defaults.ts`, remove `projects: []` from
`DEFAULT_SETTINGS` and replace the body of `mergeSettings` after `schema`
with:

```ts
  const { projects: rawProjects, ...rest } = s;
  const merged: TaskTrackerSettings = { ...DEFAULT_SETTINGS, ...rest, schema };
  if (Array.isArray(rawProjects)) {
    merged.projects = rawProjects.filter(
      (p): p is LegacyProject =>
        p !== null &&
        typeof p === 'object' &&
        typeof p.name === 'string' &&
        typeof p.idPrefix === 'string' &&
        p.name.length > 0 &&
        (p.folder === undefined || typeof p.folder === 'string'),
    );
  }
  return merged;
```

Import the type with `import type { LegacyProject, TaskTrackerSettings } from './types';`.

In `src/settings/projects.ts`, change `ProjectDef` to `LegacyProject`
everywhere. Existing callers of `settings.projects` now see
`LegacyProject[] | undefined`. Add `?? []` at each read so typecheck stays
green until Task 6 removes them:
- `src/main.ts:131`: `[...(this.settings.projects ?? []), { name, idPrefix }]`,
  plus the two uses on lines 136 and 132 (`ensureProjectField(...,
  this.settings.projects ?? [])`)
- `src/settings/projects.ts`: `taskFolders`, `folderForProject` and
  `prefixForProject` use `(settings.projects ?? [])`
- `src/settings/SettingsTab.ts:69,82`: `for (const p of s.projects ?? [])`
  and `s.projects = (s.projects ?? []).filter(...)`
- `src/ui/CreateTaskModal.ts`: at the top of `onOpen`, add
  `const projects = this.settings.projects ?? [];` and use `projects` in
  place of `this.settings.projects`
- `src/ui/CreateProjectModal.ts:60`: `(this.settings.projects ?? []).some(...)`

Update `tests/settings/defaults.test.ts`:
- Change the `starts with no projects` assertion to
  `expect(DEFAULT_SETTINGS.projects).toBeUndefined();`
- Change the malformed-entries test to:

```ts
  it('drops malformed project entries and non-array values', () => {
    expect(mergeSettings({ projects: 'nope' }).projects).toBeUndefined();
    expect(mergeSettings({ projects: [{ name: '', idPrefix: 'X' }, null, 3] }).projects).toEqual([]);
  });
```

- [ ] **Step 3: Run to confirm the migrate tests fail**

Run: `npx vitest run tests/settings/migrate.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/settings/migrate".

- [ ] **Step 4: Implement `src/settings/migrate.ts`:**

```ts
import type { VaultAdapter } from '../write/vault';
import { parentOf, projectFilePath, serializeProjectFrontmatter } from './projectFile';
import { PROJECT_KEY, projectFolder } from './projects';
import type { ProjectScope, TaskTrackerSettings } from './types';

export const PROJECT_FILE_BODY =
  'Settings for this Task Tracker project. Edit the properties above, '
  + 'or use the ⚙ button next to the project picker in the tracker.\n';

/** Create a settings file for `scope`. Fails if the file already exists. */
export async function writeProjectFile(
  vault: VaultAdapter,
  filePath: string,
  scope: ProjectScope,
): Promise<void> {
  await vault.create(filePath, PROJECT_FILE_BODY);
  await vault.processFrontmatter(filePath, (fm) => {
    Object.assign(fm, serializeProjectFrontmatter({ ...scope, filePath }));
  });
}

export interface MigrationResult {
  created: string[];
  /** Settings files that already existed and were left alone. */
  skipped: string[];
  /** "<project>: <error>" for each project that could not be written. */
  failed: string[];
}

/**
 * Give every legacy project in plugin settings its own Settings/project.md,
 * next to its tasks folder. The project inherits the global fields, which
 * is what it was using until now.
 */
export async function migrateLegacyProjects(
  vault: VaultAdapter,
  settings: TaskTrackerSettings,
): Promise<MigrationResult> {
  const result: MigrationResult = { created: [], skipped: [], failed: [] };
  const schema = settings.schema.filter((f) => f.key !== PROJECT_KEY);
  const usedRoots = new Set<string>();

  for (const p of settings.projects ?? []) {
    const folder = projectFolder(p);
    const parent = parentOf(folder);
    // A folder at the vault root has no parent to hold Settings/, and two
    // projects under one parent can't share a file: those get a root of
    // their own, and their tasksFolder points back by vault path.
    const root = parent !== '' && !usedRoots.has(parent) ? parent : p.name;
    usedRoots.add(root);
    const filePath = projectFilePath(root);
    try {
      if (await vault.exists(filePath)) {
        result.skipped.push(filePath);
        continue;
      }
      await writeProjectFile(vault, filePath, {
        name: p.name,
        filePath,
        idPrefix: p.idPrefix,
        tasksFolder: folder,
        schema,
        statusFieldKey: settings.statusFieldKey,
        doneStatuses: settings.doneStatuses,
        dueFieldKey: settings.dueFieldKey,
      });
      result.created.push(filePath);
    } catch (e) {
      result.failed.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

/** Settings once every project lives in a file: no list, no global project field. */
export function withoutLegacyProjects(settings: TaskTrackerSettings): TaskTrackerSettings {
  const { projects: _migrated, ...rest } = settings;
  return { ...rest, schema: settings.schema.filter((f) => f.key !== PROJECT_KEY) };
}
```

If lint flags `_migrated` as unused, check `eslint.config.*` for an
`argsIgnorePattern`/`varsIgnorePattern`. If there isn't one, use
`const rest = { ...settings }; delete rest.projects;` instead.

- [ ] **Step 5: Run the tests**

Run: `npm test && npm run typecheck`
Expected: every test passes (including the updated defaults tests), and
typecheck is clean.

- [ ] **Step 6: Commit**

```bash
git add src/settings tests/settings src/main.ts src/ui/CreateTaskModal.ts src/ui/CreateProjectModal.ts
git commit -m "Migrate legacy projects into settings files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Store knows the current project

**Files:**
- Modify: `src/ui/store.ts`
- Test: `tests/ui/store.test.ts`

**Interfaces:**
- Produces:
  - `StoreState.project: string | null`
  - `new Store(project?: string | null)`
  - `store.setProject(project: string | null, fieldKeys: string[]): void`

- [ ] **Step 1: Add failing tests** (append to `tests/ui/store.test.ts`):

```ts
describe('Store.setProject', () => {
  it('starts on the project it was given, or none', () => {
    expect(new Store().getState().project).toBeNull();
    expect(new Store('Alpha').getState().project).toBe('Alpha');
  });

  it('clears filters and selection, keeps search and hide-done', () => {
    const s = new Store();
    s.setQuery({ search: 'login', hideDone: true });
    s.toggleFilter('sprint', 'S1');
    s.select('Tasks/TASK-1 A.md');
    s.setProject('Alpha', ['status', 'sprint']);
    const st = s.getState();
    expect(st.project).toBe('Alpha');
    expect(st.selectedPath).toBeNull();
    expect(st.query.filters).toEqual({});
    expect(st.query.search).toBe('login');
    expect(st.query.hideDone).toBe(true);
  });

  it('keeps grouping and sort when the new project has those fields', () => {
    const s = new Store();
    s.setQuery({ groupBy: 'status', sortKey: 'due' });
    s.setProject('Alpha', ['status', 'due']);
    expect(s.getState().query.groupBy).toBe('status');
    expect(s.getState().query.sortKey).toBe('due');
  });

  it('resets grouping and sort that the new project lacks', () => {
    const s = new Store();
    s.setQuery({ groupBy: 'sprint', sortKey: 'estimate' });
    s.setProject(null, ['status']);
    expect(s.getState().query.groupBy).toBeNull();
    expect(s.getState().query.sortKey).toBe('updated');
  });

  it('keeps a built-in sort key', () => {
    const s = new Store();
    s.setQuery({ sortKey: 'title' });
    s.setProject('Alpha', []);
    expect(s.getState().query.sortKey).toBe('title');
  });
});
```

Also add `expect(s.getState().project).toBeNull();` to the existing
"starts with an empty query and no selection" test.

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/ui/store.test.ts`
Expected: FAIL (`setProject is not a function`, and `project` is undefined).

- [ ] **Step 3: Implement.** In `src/ui/store.ts`:

```ts
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
```

Delete the old field initializer for `state`. Then add:

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ui/store.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/store.ts tests/ui/store.test.ts
git commit -m "Track the current project in the view store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Extract the field editor

This is a pure refactor with no behaviour change. It must be done before
Task 8 can reuse the editor.

**Files:**
- Create: `src/settings/fieldEditor.ts`
- Modify: `src/settings/SettingsTab.ts` (the "Status and dates", "Fields"
  and "Add a field" sections)

**Interfaces:**
- Produces:
  - `FieldConfig { schema: FieldDef[]; statusFieldKey: string; doneStatuses: string[]; dueFieldKey: string | null }`
  - `renderFieldEditor(el: HTMLElement, config: FieldConfig, onChange: (next: FieldConfig, redraw: boolean) => void): void`

- [ ] **Step 1: Create `src/settings/fieldEditor.ts`.** The code is moved
  from `SettingsTab.display()`, and each save becomes a call to `emit`:

```ts
import { Notice, Setting } from 'obsidian';
import type { FieldDef, FieldType } from '../schema/types';
import {
  addField, removeField, reorderField, sortedSchema, updateField, validateFieldDef,
} from '../schema/validate';

const TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'multiselect', 'checkbox', 'person'];

/** The part of a scope the field editor edits. */
export interface FieldConfig {
  schema: FieldDef[];
  statusFieldKey: string;
  doneStatuses: string[];
  dueFieldKey: string | null;
}

/**
 * Status, due-date and field settings, shared by plugin settings ("No
 * project") and each project's settings form. `onChange` receives the whole
 * updated config. `redraw` is true when the editor's own layout depends on
 * the change and false for edits made while typing, which the caller should
 * debounce.
 */
export function renderFieldEditor(
  el: HTMLElement,
  config: FieldConfig,
  onChange: (next: FieldConfig, redraw: boolean) => void,
): void {
  let c = config;
  const emit = (patch: Partial<FieldConfig>, redraw: boolean) => {
    c = { ...c, ...patch };
    onChange(c, redraw);
  };

  new Setting(el).setName('Status and dates').setHeading();

  new Setting(el)
    .setName('Status field')
    .addDropdown((d) => {
      for (const f of c.schema.filter((f) => f.type === 'select')) d.addOption(f.key, f.label);
      d.setValue(c.statusFieldKey).onChange((v) => emit({ statusFieldKey: v }, true));
    });

  const statusField = c.schema.find((f) => f.key === c.statusFieldKey);
  for (const opt of statusField?.options ?? []) {
    new Setting(el)
      .setName(`"${opt}" counts as done`)
      .addToggle((t) => t.setValue(c.doneStatuses.includes(opt)).onChange((on) => {
        emit({
          doneStatuses: on
            ? [...new Set([...c.doneStatuses, opt])]
            : c.doneStatuses.filter((x) => x !== opt),
        }, false);
      }));
  }

  new Setting(el)
    .setName('Due date field')
    .setDesc('Drives the due / overdue badge.')
    .addDropdown((d) => {
      d.addOption('', 'None');
      for (const f of c.schema.filter((f) => f.type === 'date')) d.addOption(f.key, f.label);
      d.setValue(c.dueFieldKey ?? '').onChange((v) => emit({ dueFieldKey: v === '' ? null : v }, false));
    });

  new Setting(el).setName('Fields').setHeading();

  const sorted = sortedSchema(c.schema);
  sorted.forEach((f, i) => {
    new Setting(el)
      .setName(`${f.label} (${f.type})`)
      .setDesc(`Key: ${f.key}${f.options?.length ? ` · ${f.options.join(', ')}` : ''}`)
      .addText((t) => t.setPlaceholder('Label').setValue(f.label).onChange((v) => {
        if (v.trim().length === 0) return;
        emit({ schema: updateField(c.schema, f.key, { label: v.trim() }) }, false);
      }))
      .addText((t) => t.setPlaceholder('Options, comma separated')
        .setValue((f.options ?? []).join(', '))
        .setDisabled(f.type !== 'select' && f.type !== 'multiselect')
        .onChange((v) => {
          const options = v.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
          emit({ schema: updateField(c.schema, f.key, { options }) }, false);
        }))
      .addToggle((t) => t.setTooltip('Show on list rows')
        .setValue(f.showInList === true)
        .onChange((on) => emit({ schema: updateField(c.schema, f.key, { showInList: on }) }, false)))
      .addButton((b) => b.setIcon('arrow-up').setDisabled(i === 0).onClick(() => {
        emit({ schema: reorderField(c.schema, f.key, i - 1) }, true);
      }))
      .addButton((b) => b.setIcon('arrow-down').setDisabled(i === sorted.length - 1).onClick(() => {
        emit({ schema: reorderField(c.schema, f.key, i + 1) }, true);
      }))
      .addButton((b) => b.setIcon('trash').setWarning().onClick(() => {
        if (f.key === c.statusFieldKey) {
          new Notice('Pick a different status field before deleting this one.');
          return;
        }
        emit({
          schema: removeField(c.schema, f.key),
          dueFieldKey: c.dueFieldKey === f.key ? null : c.dueFieldKey,
        }, true);
      }));
  });

  new Setting(el).setName('Add a field').setHeading();

  let newKey = '';
  let newLabel = '';
  let newType: FieldType = 'text';
  let newOptions = '';

  new Setting(el)
    .setName('New field')
    .setDesc('Key becomes the frontmatter key and cannot be changed later.')
    .addText((t) => t.setPlaceholder('key').onChange((v) => { newKey = v.trim(); }))
    .addText((t) => t.setPlaceholder('Label').onChange((v) => { newLabel = v.trim(); }))
    .addDropdown((d) => {
      for (const t of TYPES) d.addOption(t, t);
      d.setValue('text').onChange((v) => { newType = v as FieldType; });
    })
    .addText((t) => t.setPlaceholder('options, comma separated')
      .onChange((v) => { newOptions = v; }))
    .addButton((b) => b.setButtonText('Add').setCta().onClick(() => {
      const def: FieldDef = {
        key: newKey,
        label: newLabel || newKey,
        type: newType,
        options: newOptions.split(',').map((x) => x.trim()).filter((x) => x.length > 0),
        order: c.schema.length,
      };
      const errors = validateFieldDef(def, c.schema);
      if (errors.length > 0) {
        new Notice(errors.join('\n'));
        return;
      }
      emit({ schema: addField(c.schema, def) }, true);
    }));
}
```

- [ ] **Step 2: Use it in `SettingsTab.display()`**

Delete the code from `new Setting(containerEl).setName('Status and dates').setHeading();`
through the end of the "Add a field" block (just before
`new Setting(containerEl).setName('Maintenance')`). Replace it with:

```ts
    renderFieldEditor(containerEl, s, (next, redraw) => {
      Object.assign(s, next);
      if (redraw) void save();
      else this.debouncedSave();
    });
```

Remove the imports that are now unused (`FieldDef`, `FieldType`,
`addField`, `removeField`, `reorderField`, `sortedSchema`, `updateField`,
`validateFieldDef` and the `TYPES` const). Add
`import { renderFieldEditor } from './fieldEditor';`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test && npx eslint src/settings/fieldEditor.ts src/settings/SettingsTab.ts && npm run build`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add src/settings/fieldEditor.ts src/settings/SettingsTab.ts
git commit -m "Extract the field editor from the settings tab

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Projects come from files (plugin wiring)

**Files:**
- Modify:
  - `src/main.ts`
  - `src/settings/projects.ts`
  - `src/settings/SettingsTab.ts`
  - `src/ui/CreateProjectModal.ts`
  - `src/ui/CreateTaskModal.ts`
- Test: `tests/settings/projects.test.ts`

**Interfaces:**
- Consumes:
  - from Task 2: `ProjectRegistry` and `ProjectFileSource`
  - from Task 3: `migrateLegacyProjects`, `withoutLegacyProjects` and
    `writeProjectFile`
  - from Task 1: `projectFilePath` and `noProjectScope`
- Produces:
  - `plugin.registry: ProjectRegistry`
  - `plugin.vaultAdapter: ObsidianVaultAdapter`
  - `plugin.openCreateModal(project?: string | null)`
  - `plugin.openProjectSettings(project: string | null)`: a stub in this
    task that opens plugin settings; Task 8 fills in the project branch
  - `plugin.views(): TaskTrackerView[]`
  - `new CreateTaskModal(app, registry, initialProject, onSubmit)`, where
    `onSubmit` receives `{ title, fields, project: string | null }`
  - `new CreateProjectModal(app, existingNames: () => string[], onSubmit)`

- [ ] **Step 1: Shrink `src/settings/projects.ts` and its tests**

Keep `PROJECT_KEY`, `projectFolder` and `suggestPrefix`. Delete
`taskFolders`, `folderForProject`, `ensureProjectField` and
`prefixForProject`, and remove the now-unused `FieldDef` and
`TaskTrackerSettings` imports. In `tests/settings/projects.test.ts`,
delete the `ensureProjectField` and `prefixForProject` describes and the
`taskFolders`/`folderForProject` tests. Keep the `projectFolder` test,
rewritten so it doesn't need settings:

```ts
describe('projectFolder', () => {
  it('defaults to <name>/Tasks and trims slashes off an explicit folder', () => {
    expect(projectFolder({ name: 'Shahin NPU', idPrefix: 'SHN' })).toBe('Shahin NPU/Tasks');
    expect(projectFolder({ name: 'Web', idPrefix: 'WEB', folder: '/Work/Web Tasks/' })).toBe('Work/Web Tasks');
  });
});
```

Update the import line to
`import { projectFolder, suggestPrefix } from '../../src/settings/projects';`.

- [ ] **Step 2: Rewrite `src/ui/CreateProjectModal.ts`'s dependencies**

Replace the `settings` constructor parameter with
`private existingNames: () => string[]`. Replace the duplicate-name check
with:

```ts
        if (this.existingNames().includes(name)) {
```

Remove the `TaskTrackerSettings` import.

- [ ] **Step 3: Rewrite `src/ui/CreateTaskModal.ts` on top of the registry**

The project dropdown rebuilds the fields for the chosen project and keeps
values typed into fields that have the same key. Replace the whole file
with:

```ts
import { App, Modal, Notice, Setting } from 'obsidian';
import type { FieldDef, FieldValue } from '../schema/types';
import { sortedSchema } from '../schema/validate';
import type { ProjectRegistry } from '../settings/projectRegistry';

/** Sensible initial value for a field type so the form opens pre-filled. */
function defaultValueFor(def: FieldDef): FieldValue {
  switch (def.type) {
    case 'select': {
      const opts = def.options ?? [];
      return opts.length > 0 ? opts[0] : null;
    }
    case 'multiselect':
      return [];
    case 'checkbox':
      return false;
    default:
      return null;
  }
}

export interface CreateTaskResult {
  title: string;
  fields: Record<string, unknown>;
  /** Project chosen for this task, or null for none. */
  project: string | null;
}

export class CreateTaskModal extends Modal {
  private title = '';
  private fields: Record<string, unknown> = {};
  private fieldsEl: HTMLElement | null = null;

  constructor(
    app: App,
    private registry: ProjectRegistry,
    private project: string | null,
    private onSubmit: (result: CreateTaskResult) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Create issue' });

    new Setting(contentEl).setName('Title').addText((t) => {
      t.setPlaceholder('Short summary');
      t.inputEl.addClass('tt-modal-title-input');
      t.onChange((v) => { this.title = v; });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    const projects = this.registry.all();
    if (this.project !== null && !projects.some((p) => p.name === this.project)) this.project = null;
    if (projects.length > 0) {
      new Setting(contentEl)
        .setName('Project')
        .setDesc('Decides the ID prefix, the folder and which fields apply.')
        .addDropdown((d) => {
          d.addOption('', 'No project');
          for (const p of projects) {
            if (p.name !== null) d.addOption(p.name, `${p.name} (${p.idPrefix})`);
          }
          d.setValue(this.project ?? '');
          d.onChange((v) => {
            this.project = v === '' ? null : v;
            this.renderFields();
          });
        });
    }

    this.fieldsEl = contentEl.createDiv();
    this.renderFields();

    new Setting(contentEl).addButton((b) =>
      b.setButtonText('Create').setCta().onClick(() => {
        if (this.title.trim().length === 0) {
          new Notice('A title is required.');
          return;
        }
        this.onSubmit({ title: this.title.trim(), fields: this.fields, project: this.project });
        this.close();
      }),
    );
  }

  /** (Re)build the field inputs for the chosen project's schema. */
  private renderFields(): void {
    const el = this.fieldsEl;
    if (!el) return;
    el.empty();
    const schema = sortedSchema(this.registry.scopeFor(this.project).schema);

    // Keep what was typed into fields the new project shares; default the rest.
    const previous = this.fields;
    this.fields = {};
    for (const def of schema) {
      this.fields[def.key] = def.key in previous ? previous[def.key] : defaultValueFor(def);
    }

    for (const def of schema) {
      const setting = new Setting(el).setName(def.label);
      if (def.required) setting.setDesc('Required');
      const current = this.fields[def.key];

      if (def.type === 'select') {
        setting.addDropdown((d) => {
          d.addOption('', '—');
          for (const o of def.options ?? []) d.addOption(o, o);
          d.setValue(typeof current === 'string' && (def.options ?? []).includes(current) ? current : '');
          d.onChange((v) => { this.fields[def.key] = v || null; });
        });
      } else if (def.type === 'multiselect') {
        const opts = def.options ?? [];
        const selected = new Set<string>(
          (Array.isArray(current) ? current.map(String) : []).filter((v) => opts.length === 0 || opts.includes(v)),
        );
        this.fields[def.key] = [...selected];
        if (opts.length === 0) {
          setting.addText((t) => {
            t.setPlaceholder('Comma, separated');
            t.setValue([...selected].join(', '));
            t.onChange((v) => {
              this.fields[def.key] = v.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
            });
          });
        } else if (opts.length > 8) {
          // Long lists (sprints, components, ...) as an add-dropdown plus removable pills.
          const pills = setting.controlEl.createDiv({ cls: 'tt-pills' });
          const redraw = () => {
            pills.empty();
            for (const v of selected) {
              const pill = pills.createSpan({ cls: 'tt-pill', text: v });
              const x = pill.createEl('button', { cls: 'tt-pill-x', text: '×' });
              x.addEventListener('click', () => {
                selected.delete(v);
                this.fields[def.key] = [...selected];
                redraw();
              });
            }
          };
          setting.addDropdown((d) => {
            d.addOption('', 'Add…');
            for (const o of opts) d.addOption(o, o);
            d.onChange((v) => {
              if (v !== '') selected.add(v);
              this.fields[def.key] = [...selected];
              d.setValue('');
              redraw();
            });
          });
          redraw();
        } else {
          const wrap = setting.controlEl.createDiv({ cls: 'tt-multiselect' });
          for (const o of opts) {
            const label = wrap.createEl('label');
            const cb = label.createEl('input', { type: 'checkbox' });
            cb.checked = selected.has(o);
            cb.addEventListener('change', () => {
              if (cb.checked) selected.add(o);
              else selected.delete(o);
              this.fields[def.key] = [...selected];
            });
            label.appendText(o);
          }
        }
      } else if (def.type === 'checkbox') {
        setting.addToggle((tg) => {
          tg.setValue(current === true);
          tg.onChange((v) => { this.fields[def.key] = v; });
        });
      } else if (def.type === 'date') {
        setting.addText((t) => {
          t.inputEl.type = 'date';
          if (typeof current === 'string') t.setValue(current);
          t.onChange((v) => { this.fields[def.key] = v || null; });
        });
      } else if (def.type === 'number') {
        setting.addText((t) => {
          t.inputEl.type = 'number';
          if (typeof current === 'number') t.setValue(String(current));
          t.onChange((v) => { this.fields[def.key] = v === '' ? null : Number(v); });
        });
      } else {
        setting.addText((t) => {
          if (typeof current === 'string') t.setValue(current);
          t.onChange((v) => { this.fields[def.key] = v || null; });
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

- [ ] **Step 4: Wire the registry into `src/main.ts`**

Imports: remove the `./settings/projects` import line and add:

```ts
import { PROJECT_KEY } from './settings/projects';
import { ProjectRegistry } from './settings/projectRegistry';
import { noProjectScope, projectFilePath } from './settings/projectFile';
import { migrateLegacyProjects, withoutLegacyProjects, writeProjectFile } from './settings/migrate';
import { sanitizeFilename } from './write/writer';
```

(`TaskWriter` is already imported from `./write/writer`, so merge the two
into one import line.)

Class fields: add `registry!: ProjectRegistry;` and
`vaultAdapter!: ObsidianVaultAdapter;`.

In `onload`, replace the index and writer construction with:

```ts
    this.registry = new ProjectRegistry(
      {
        markdownPaths: () => this.app.vault.getMarkdownFiles().map((f) => f.path),
        frontmatterOf: (path) => source.frontmatterOf(path),
      },
      () => this.settings,
    );
    this.index = new TaskIndex(source, () => this.registry.taskFolders());
    // A project appearing, moving or changing its tasks folder changes what the index scans.
    this.registry.onChange(() => { void this.index.rebuild(); });
    this.vaultAdapter = new ObsidianVaultAdapter(this.app);
    this.writer = new TaskWriter(this.vaultAdapter, () => this.settings);
```

Replace `this.app.workspace.onLayoutReady(() => { void this.index.rebuild(); });` with:

```ts
    this.app.workspace.onLayoutReady(() => {
      void (async () => {
        await this.migrateProjects();
        this.registry.rebuild();
      })();
    });
```

Replace the three `registerEvent` blocks with:

```ts
    this.registerEvent(this.app.metadataCache.on('changed', (file) => {
      if (!this.registry.update(file.path)) void this.index.updateOne(file.path);
    }));
    this.registerEvent(this.app.vault.on('delete', (file) => {
      if (!this.registry.remove(file.path)) this.index.remove(file.path);
    }));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (!this.registry.remove(oldPath)) this.index.remove(oldPath);
      if (!this.registry.update(file.path)) void this.index.updateOne(file.path);
    }));
```

Add these methods:

```ts
  /** One-time move of legacy settings.projects into Settings/project.md files. */
  private async migrateProjects(): Promise<void> {
    if (this.settings.projects === undefined) return;
    const result = await migrateLegacyProjects(this.vaultAdapter, this.settings);
    if (result.failed.length > 0) {
      new Notice(
        'Task Tracker: some projects could not be moved into settings notes; '
        + `will retry next start.\n${result.failed.join('\n')}`,
      );
      return;
    }
    this.settings = withoutLegacyProjects(this.settings);
    await this.saveData(this.settings);
    if (result.created.length > 0) {
      new Notice(`Task Tracker: project settings now live in\n${result.created.join('\n')}`);
    }
  }

  views(): TaskTrackerView[] {
    return this.app.workspace.getLeavesOfType(VIEW_TYPE_TASK_TRACKER)
      .map((leaf) => leaf.view)
      .filter((v): v is TaskTrackerView => v instanceof TaskTrackerView);
  }

  /** Project shown in the first open tracker view, for commands run from the palette. */
  private currentProject(): string | null {
    return this.views()[0]?.currentProject() ?? null;
  }

  /** Project settings form, or plugin settings for "No project". */
  openProjectSettings(project: string | null): void {
    if (project === null) {
      const setting = (this.app as unknown as {
        setting?: { open(): void; openTabById(id: string): void };
      }).setting;
      setting?.open();
      setting?.openTabById(this.manifest.id);
      return;
    }
    // Task 8 replaces this with ProjectSettingsModal.
    const file = this.registry.get(project)?.filePath;
    if (file) void this.app.workspace.openLinkText(file, '', true);
  }
```

Replace `openCreateModal` with:

```ts
  openCreateModal(project: string | null = this.currentProject()): void {
    new CreateTaskModal(this.app, this.registry, project, ({ title, fields, project: chosen }) => {
      void (async () => {
        try {
          const scope = this.registry.scopeFor(chosen);
          const withProject = scope.name === null ? fields : { ...fields, [PROJECT_KEY]: scope.name };
          const path = await this.writer.createTask(
            title, withProject, this.index.ids(), scope.idPrefix, scope.tasksFolder,
          );
          await this.index.updateOne(path);
          for (const view of this.views()) view.selectTask(path);
        } catch (e) {
          new Notice(`Task Tracker: ${e instanceof Error ? e.message : String(e)}`);
        }
      })();
    }).open();
  }
```

Replace `openCreateProjectModal` with:

```ts
  openCreateProjectModal(): void {
    const names = () => this.registry.all().map((p) => p.name ?? '');
    new CreateProjectModal(this.app, names, (name, idPrefix) => {
      void (async () => {
        try {
          const root = sanitizeFilename(name);
          const filePath = projectFilePath(root);
          if (await this.vaultAdapter.exists(filePath)) {
            new Notice(`Task Tracker: ${filePath} already exists.`);
            return;
          }
          const base = noProjectScope(this.settings);
          const tasksFolder = `${root}/Tasks`;
          await writeProjectFile(this.vaultAdapter, filePath, {
            ...base,
            name,
            filePath,
            idPrefix,
            tasksFolder,
            schema: base.schema.filter((f) => f.key !== PROJECT_KEY),
          });
          if (!this.app.vault.getAbstractFileByPath(tasksFolder)) {
            await this.app.vault.createFolder(tasksFolder).catch(() => undefined);
          }
          for (const view of this.views()) view.selectProject(name);
          new Notice(`Project "${name}" created. Its settings are in ${filePath}.`);
        } catch (e) {
          new Notice(`Task Tracker: ${e instanceof Error ? e.message : String(e)}`);
        }
      })();
    }).open();
  }
```

`view.currentProject()` and `view.selectProject()` are added in Task 7. For
this task, add minimal versions to `src/ui/TaskTrackerView.tsx` so the code
compiles:

```ts
  currentProject(): string | null {
    return null;
  }

  selectProject(_name: string | null): void {
    // Task 7: switch the view's project.
  }
```

- [ ] **Step 5: Update `SettingsTab.ts`**

1. Delete the `for (const p of s.projects ?? [])` loop and the
   `projectFolder` import.
2. Change the "Create project" description to:
   `'Each project keeps its ID prefix, folder and fields in <project>/Settings/project.md. Open it from the ⚙ next to the project picker.'`
3. Change the "Tasks folder" description to
   `'Flat folder for tasks without a project.'`
4. Before the `renderFieldEditor(...)` call, add
   `new Setting(containerEl).setName('Fields for tasks without a project').setHeading();`
5. Fix Review Focus item 4 (the orphan scan). Replace the `known` set with
   a check for each task's own scope:

```ts
        const orphans = new Map<string, string[]>();
        for (const task of this.plugin.index.all()) {
          const scope = this.plugin.registry.scopeForPath(task.path);
          const known = new Set([PROJECT_KEY, ...scope.schema.map((f) => f.key)]);
          for (const key of Object.keys(task.fields)) {
            if (known.has(key)) continue;
            orphans.set(key, [...(orphans.get(key) ?? []), task.path]);
          }
        }
```

(`task.fields` already excludes `id`, `title`, `created` and `updated`.)
Add `import { PROJECT_KEY } from './projects';`.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test && npx eslint src/main.ts src/settings src/ui/CreateTaskModal.ts src/ui/CreateProjectModal.ts src/ui/TaskTrackerView.tsx && npm run build`
Expected: all clean. If eslint flags the `_name` parameter as unused,
leave the parameter unnamed in the stub body instead, or check the lint
config for an ignore pattern.

- [ ] **Step 7: Commit**

```bash
git add src tests
git commit -m "Load projects from Settings/project.md files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Project switcher and scope-driven view

**Files:**
- Modify:
  - `src/ui/TaskTrackerView.tsx`
  - `src/ui/App.tsx`
  - `src/ui/FilterBar.tsx`
  - `src/ui/TaskDetail.tsx`
  - `src/main.ts` (view construction)
  - `styles.css`

**Interfaces:**
- Consumes:
  - `ProjectRegistry` (Task 2)
  - `Store.setProject` (Task 4)
  - `parentOf` (Task 1)
  - `plugin.openProjectSettings` and `plugin.openCreateModal` (Task 6)
- Produces:
  - `ViewDeps`
  - `TaskTrackerView.currentProject()`
  - `TaskTrackerView.selectProject(name)`

- [ ] **Step 1: Change `TaskTrackerView` to take a deps object and keep the project**

Replace the constructor and `onOpen` of `src/ui/TaskTrackerView.tsx`, and
give the stubs from Task 6 real bodies:

```ts
import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { render } from 'preact';
import type { TaskIndex } from '../index/taskIndex';
import type { TaskWriter } from '../write/writer';
import type { TaskTrackerSettings } from '../settings/types';
import type { ProjectRegistry } from '../settings/projectRegistry';
import { App } from './App';
import { Store } from './store';

export const VIEW_TYPE_TASK_TRACKER = 'task-tracker-view';

const PROJECT_KEY_STORAGE = 'task-tracker-project';

function loadProject(): string | null {
  try {
    return window.localStorage.getItem(PROJECT_KEY_STORAGE) || null;
  } catch {
    return null;
  }
}

function saveProject(name: string | null): void {
  try {
    if (name === null) window.localStorage.removeItem(PROJECT_KEY_STORAGE);
    else window.localStorage.setItem(PROJECT_KEY_STORAGE, name);
  } catch { /* ignore */ }
}

export interface ViewDeps {
  index: TaskIndex;
  writer: TaskWriter;
  registry: ProjectRegistry;
  settings: () => TaskTrackerSettings;
  onCreate: (project: string | null) => void;
  onCreateProject: () => void;
  onProjectSettings: (project: string | null) => void;
}

export class TaskTrackerView extends ItemView {
  private store = new Store(loadProject());
  private offStore: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, private deps: ViewDeps) {
    super(leaf);
  }
```

Keep `getViewType`, `getDisplayText` and `getIcon` as they are. Then:

```ts
  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass('task-tracker-view');
    this.offStore = this.store.subscribe(() => saveProject(this.store.getState().project));
    render(
      <App
        {...this.deps}
        store={this.store}
        openAsNote={(path) => { void this.app.workspace.openLinkText(path, '', true); }}
      />,
      this.contentEl,
    );
  }

  async onClose(): Promise<void> {
    this.offStore?.();
    render(null, this.contentEl);
  }

  selectTask(path: string): void {
    this.store.select(path);
  }

  currentProject(): string | null {
    return this.store.getState().project;
  }

  selectProject(name: string | null): void {
    this.store.setProject(name, this.deps.registry.scopeFor(name).schema.map((f) => f.key));
  }
```

In `src/main.ts`, change the `registerView` factory to:

```ts
      (leaf: WorkspaceLeaf) => new TaskTrackerView(leaf, {
        index: this.index,
        writer: this.writer,
        registry: this.registry,
        settings: () => this.settings,
        onCreate: (project) => this.openCreateModal(project),
        onCreateProject: () => this.openCreateProjectModal(),
        onProjectSettings: (project) => this.openProjectSettings(project),
      }),
```

- [ ] **Step 2: Drive `App` from the current scope**

In `src/ui/App.tsx`:

1. Update `AppProps`:

```ts
export interface AppProps {
  index: TaskIndex;
  writer: TaskWriter;
  registry: ProjectRegistry;
  store: Store;
  settings: () => TaskTrackerSettings;
  openAsNote: (path: string) => void;
  onCreate: (project: string | null) => void;
  onCreateProject: () => void;
  onProjectSettings: (project: string | null) => void;
}
```

2. Update the imports: add
   `import type { ProjectRegistry } from '../settings/projectRegistry';`
   and `import { parentOf } from '../settings/projectFile';`.
   `TaskTrackerSettings` stays for the prop type.

3. Change `useRevision` so it also re-renders when the registry changes:

```ts
function useRevision(index: TaskIndex, store: Store, registry: ProjectRegistry): void {
  const [, setRev] = useState(0);
  useEffect(() => {
    const bump = () => setRev((r) => r + 1);
    const offs = [index.onChange(bump), store.subscribe(bump), registry.onChange(bump)];
    return () => { for (const off of offs) off(); };
  }, [index, store, registry]);
}
```

4. Replace the top of the `App` body (from `useRevision(...)` through the
   `selected` line) with:

```tsx
export function App({
  index, writer, registry, store, settings, openAsNote, onCreate, onCreateProject, onProjectSettings,
}: AppProps) {
  useRevision(index, store, registry);
  settings(); // "No project" scope reads it through the registry; re-read each render.
  const { query, selectedPath, project: wanted } = store.getState();
  // A saved project whose file is gone (or not indexed yet) shows as "No project"
  // without forgetting the choice.
  const current = wanted !== null && registry.get(wanted) ? wanted : null;
  const scope = registry.scopeFor(current);
  const schema = sortedSchema(scope.schema);
  const scopeTasks = index.all().filter((t) => parentOf(t.path) === scope.tasksFolder);
  const groups = applyQuery(scopeTasks, query, schema, scope.doneStatuses, scope.statusFieldKey);
  const selected = selectedPath === null ? undefined : index.get(selectedPath);
  const detailScope = selected ? registry.scopeForPath(selected.path) : scope;
  const warnings = registry.warningsFor(current);
  const projectNames = [...new Set(registry.all().map((p) => p.name ?? ''))];
```

   Remove the now-unused `const s = settings();` line. If lint rejects the
   bare `settings();` expression statement, remove it and the `settings`
   destructure instead. Leave `settings` in `AppProps` unused, because the
   view passes it through `deps`.

5. In the sidebar JSX, update `FilterBar` and add a warnings banner:

```tsx
        <FilterBar
          query={query}
          schema={schema}
          tasks={scopeTasks}
          projects={projectNames}
          project={current}
          onProject={(name) => store.setProject(name, registry.scopeFor(name).schema.map((f) => f.key))}
          onProjectSettings={() => onProjectSettings(current)}
          onQuery={(patch) => store.setQuery(patch)}
          onToggleFilter={(k, v) => store.toggleFilter(k, v)}
          onClearFilter={(k) => store.clearFilter(k)}
          onCreate={() => onCreate(current)}
          onCreateProject={onCreateProject}
        />
        {warnings.length > 0 && (
          <div class="tt-errors tt-project-warnings">
            {warnings.map((w) => (
              <div key={`${w.filePath}:${w.message}`}>
                ⚠ <a class="tt-link" onClick={() => openAsNote(w.filePath)}>{w.filePath}</a>: {w.message}
              </div>
            ))}
          </div>
        )}
        <TaskList
          groups={groups}
          schema={schema}
          dueFieldKey={scope.dueFieldKey}
          selectedPath={selectedPath}
          onSelect={(p) => { store.select(p); void index.loadBody(p); }}
        />
```

6. In the `TaskDetail` element, replace `schema={schema}` and
   `dueFieldKey={s.dueFieldKey}` with:

```tsx
            schema={sortedSchema(detailScope.schema)}
            dueFieldKey={detailScope.dueFieldKey}
            statusFieldKey={detailScope.statusFieldKey}
```

   Change `onAssignId` to use the task's project prefix:

```tsx
              await writer.setField(selected.path, 'id', writer.nextId(index.ids(), detailScope.idPrefix));
```

- [ ] **Step 3: Add the switcher row to `FilterBar`**

Add to `Props`:

```ts
  /** Names of every project, for the switcher. */
  projects: string[];
  /** Current project, or null for tasks without one. */
  project: string | null;
  onProject: (name: string | null) => void;
  onProjectSettings: () => void;
```

Destructure the four new props. In the JSX, add this as the first row, and
remove the `+ Project` button from the search row:

```tsx
      <div class="tt-filter-row">
        <select
          class="tt-project-select"
          value={project ?? ''}
          title="Project"
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            onProject(v === '' ? null : v);
          }}
        >
          <option value="">No project</option>
          {projects.map((p) => <option value={p} key={p}>{p}</option>)}
        </select>
        <button
          class="tt-icon-btn"
          title={project === null ? 'Settings for tasks without a project' : 'Project settings'}
          onClick={onProjectSettings}
        >
          ⚙
        </button>
        <button class="tt-create tt-create-secondary" onClick={onCreateProject} title="Create project">
          + Project
        </button>
      </div>
```

- [ ] **Step 4: Update `TaskDetail` for the status key and other properties**

In `src/ui/TaskDetail.tsx`:

1. Add `statusFieldKey: string;` to `Props` (after `dueFieldKey`).
2. Add `import { PROJECT_KEY } from '../settings/projects';`.
3. Replace the `statusDef` and `statusValue` lines with:

```ts
  const statusDef = schema.find((f) => f.key === props.statusFieldKey);
  const rawStatus = task.fields[props.statusFieldKey];
  const statusValue = typeof rawStatus === 'string' ? rawStatus : null;
  // Values for fields this project doesn't define: shown, never dropped silently.
  const known = new Set([PROJECT_KEY, ...schema.map((f) => f.key)]);
  const others = Object.entries(task.fields)
    .filter(([k, v]) => !known.has(k) && v !== null && v !== undefined && v !== '');
```

4. After the Details `</section>`, add:

```tsx
      {others.length > 0 && (
        <section class="tt-section">
          <h3 class="tt-section-title">Other properties</h3>
          <div class="tt-fields">
            {others.map(([k, v]) => (
              <div class="tt-field" key={k}>
                <label class="tt-field-label">{k}</label>
                <div class="tt-field-input tt-field-readonly">
                  {Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
```

- [ ] **Step 5: Styles** (append to `styles.css`, in the filter bar section):

```css
.tt-project-select { flex: 1; min-width: 0; font-weight: 600; }
.tt-project-warnings { padding: 6px 10px; margin: 0; font-size: 12px; border-bottom: 1px solid var(--background-modifier-border); }
.tt-link { cursor: pointer; text-decoration: underline; }
.tt-field-readonly { align-self: center; font-size: 13px; color: var(--text-muted); overflow-wrap: anywhere; }
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test && npx eslint src/ui src/main.ts && npm run build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add src styles.css
git commit -m "Switch the tracker view between projects

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Project settings form

**Files:**
- Create: `src/ui/ProjectSettingsModal.ts`
- Modify: `src/main.ts` (`openProjectSettings`)

**Interfaces:**
- Consumes:
  - `renderFieldEditor` and `FieldConfig` (Task 5)
  - `ProjectRegistry` (Task 2)
  - `serializeProjectFrontmatter`, `projectRoot`, `resolveTasksFolder` and
    `relativeTasksFolder` (Task 1)
  - `VaultAdapter`
- Produces:
  - `new ProjectSettingsModal(app, registry, name, vault)`

- [ ] **Step 1: Create `src/ui/ProjectSettingsModal.ts`:**

```ts
import { App, debounce, Modal, Setting } from 'obsidian';
import { renderFieldEditor } from '../settings/fieldEditor';
import {
  projectRoot, relativeTasksFolder, resolveTasksFolder, serializeProjectFrontmatter,
} from '../settings/projectFile';
import type { ProjectRegistry } from '../settings/projectRegistry';
import type { ProjectScope } from '../settings/types';
import type { VaultAdapter } from '../write/vault';

/**
 * Edits one project's Settings/project.md. The file stays the source of
 * truth: every change is written back to its frontmatter, and a hand edit
 * made elsewhere redraws the form.
 */
export class ProjectSettingsModal extends Modal {
  /** Latest edits, ahead of the file until the metadata cache catches up. */
  private pending: ProjectScope | null = null;
  private dirty = false;
  private offRegistry: (() => void) | null = null;
  private flush = debounce(() => { void this.write(); }, 400, true);

  constructor(
    app: App,
    private registry: ProjectRegistry,
    private projectName: string,
    private vault: VaultAdapter,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(`Project settings: ${this.projectName}`);
    this.render();
    this.offRegistry = this.registry.onChange(() => {
      if (!this.dirty) this.pending = null;
      // Our own saves come back through here as well: don't redraw under the cursor.
      if (this.contentEl.contains(this.contentEl.ownerDocument.activeElement)) return;
      this.render();
    });
  }

  onClose(): void {
    this.flush.run();
    this.offRegistry?.();
    this.contentEl.empty();
  }

  private current(): ProjectScope | undefined {
    return this.pending ?? this.registry.get(this.projectName);
  }

  private change(next: ProjectScope, redraw: boolean): void {
    this.pending = next;
    this.dirty = true;
    this.flush();
    if (redraw) this.render();
  }

  private async write(): Promise<void> {
    const next = this.pending;
    if (!next || next.filePath === null) return;
    await this.vault.processFrontmatter(next.filePath, (fm) => {
      Object.assign(fm, serializeProjectFrontmatter(next));
    });
    if (this.pending === next) this.dirty = false;
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    const scope = this.current();
    if (!scope || scope.filePath === null) {
      contentEl.createEl('p', { text: 'This project no longer exists.' });
      return;
    }
    const filePath = scope.filePath;
    const root = projectRoot(filePath);

    new Setting(contentEl)
      .setName('Settings note')
      .setDesc(filePath)
      .addButton((b) => b.setButtonText('Open').onClick(() => {
        this.close();
        void this.app.workspace.openLinkText(filePath, '', true);
      }));

    new Setting(contentEl)
      .setName('ID prefix')
      .setDesc('New tasks get IDs like PREFIX-1. Existing IDs are not changed.')
      .addText((t) => t.setValue(scope.idPrefix).onChange((v) => {
        const prefix = v.trim().toUpperCase();
        const cur = this.current();
        if (prefix !== '' && cur) this.change({ ...cur, idPrefix: prefix }, false);
      }));

    new Setting(contentEl)
      .setName('Tasks folder')
      .setDesc('Relative to the project folder. Start with / for a path from the vault root.')
      .addText((t) => t.setValue(relativeTasksFolder(root, scope.tasksFolder)).onChange((v) => {
        const cur = this.current();
        if (cur) this.change({ ...cur, tasksFolder: resolveTasksFolder(root, v) }, false);
      }));

    renderFieldEditor(contentEl, scope, (next, redraw) => {
      const cur = this.current();
      if (cur) this.change({ ...cur, ...next }, redraw);
    });
  }
}
```

- [ ] **Step 2: Open it from `main.ts`**

In `openProjectSettings`, replace the Task 6 stub branch (the two lines
after the `// Task 8 replaces this` comment, plus the comment) with:

```ts
    new ProjectSettingsModal(this.app, this.registry, project, this.vaultAdapter).open();
```

Add `import { ProjectSettingsModal } from './ui/ProjectSettingsModal';`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test && npx eslint src/ui/ProjectSettingsModal.ts src/main.ts && npm run build`
Expected: all clean. If the obsidianmd lint flags "Project settings: …" for
sentence case, rephrase it to satisfy the rule.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ProjectSettingsModal.ts src/main.ts
git commit -m "Edit project settings from a form that writes the settings note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs and final verification

**Files:**
- Modify: `README.md` (the settings/projects section around lines 50–65)

- [ ] **Step 1: Update README.** Replace the Projects bullet and the folder
  sketch with:

````markdown
- **Projects** — each project is a folder with a settings note and a tasks
  folder. The note's properties define the project: its name, ID prefix and
  its own fields, statuses and due field. Edit them by hand, or with the ⚙
  button next to the project picker.

```
Tasks/                          tasks with no project (TASK-1, …)
Project1/Settings/project.md    tt-project: Project1, idPrefix: PROJ1, fields: …
Project1/Tasks/                 PROJ1-1, PROJ1-2, …
```

  Projects created before settings notes existed are moved into notes the
  first time the plugin starts.
````

- [ ] **Step 2: Full verification**

Run: `npm test && npm run typecheck && npx eslint src && npm run build`
Expected: every test passes, typecheck is clean, and eslint reports no
errors in `src`.

- [ ] **Step 3: Manual check in Obsidian** (copy `main.js`, `styles.css`
  and `manifest.json` into a test vault's plugin folder):
  1. A vault with a legacy project gets `<root>/Settings/project.md`, and
     `projects` is gone from `data.json`.
  2. The switcher shows the project. The list shows only its tasks, and the
     filters only offer its fields.
  3. Adding a field to `project.md` by hand appears in the view without a
     reload. A typo in a field's type shows the warning banner.
  4. In the ⚙ form, typing in a label or the prefix keeps focus. Reordering
     and adding fields redraws the form. The note body is unchanged.
  5. "+ Issue" in a project creates `<root>/Tasks/<PREFIX>-n …md` with that
     project's fields. Changing the project in the modal swaps the fields.
  6. Renaming the project folder in the file explorer keeps it selected in
     the switcher.
  7. "Clean up orphaned frontmatter keys" doesn't offer to delete a
     project's own fields.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Document project settings notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
