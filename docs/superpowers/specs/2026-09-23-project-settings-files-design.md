# Project settings files — design

Date: 2026-09-23
Status: Draft, awaiting review

## Goal

Manage each project's settings and fields from inside the vault. A project
is defined by a Markdown file in a `Settings` folder beside its `Tasks`
folder. Each project has its own fields, status field, done statuses, due
field and ID prefix. Plugin settings keep only global defaults and the
fields for tasks with no project.

## Decisions (agreed)

| Question | Decision |
|---|---|
| What the file controls | Per-project fields and project config |
| View with differing fields | A project switcher; one project (or "No project") at a time |
| Where the project list lives | Vault files only; existing projects migrated once |
| How fields are edited | By hand in frontmatter, plus a form that saves to the file |
| File format | YAML frontmatter in `Settings/project.md`; body is free notes |

## File layout

```
MyProject/
  Settings/project.md
  Tasks/MYP-1 Some task.md
```

`project.md`:

```yaml
---
tt-project: MyProject        # marker + display name (required)
idPrefix: MYP                # required
tasksFolder: Tasks           # optional; relative to the project root; default "Tasks"
statusField: status          # optional; default "status"
doneStatuses: [Done]         # optional; default [Done]
dueField: due                # optional; null disables the due badge; default "due"
fields:                      # FieldDef[] (see src/schema/types.ts); `order` is the list position
  - { key: status, label: Status, type: select, options: [To Do, In Progress, Done], showInList: true }
  - { key: sprint, label: Sprint, type: multiselect, options: [S1, S2] }
---
Free notes about the project.
```

The **project root** is the parent of the `Settings` folder. The project's
tasks folder is `<root>/<tasksFolder>`. Only a file named exactly
`project.md` directly inside a folder named `Settings` whose frontmatter has
a non-empty string `tt-project` is a project file.

## Components

### `src/settings/projectFile.ts` (new, pure)

- `parseProjectFile(path, frontmatter): { project: ProjectScope | null; warnings: string[] }`
  - Returns `null` with a warning when `tt-project` or `idPrefix` is missing
    or not a string.
  - Each field is checked with the existing `validateFieldDef`. Invalid fields
    are skipped, with a warning naming the field. `order` is assigned from
    the field's position in the list.
  - Optional keys fall back to their defaults. A `statusField` or `dueField`
    that names no field produces a warning and falls back to the default.
- `serializeProjectFrontmatter(scope): Record<string, unknown>` — the inverse,
  used by the settings form and by migration.
- `projectFilePath(root)`: `<root>/Settings/project.md`.

### `ProjectScope` (in `src/settings/types.ts`)

```ts
interface ProjectScope {
  name: string | null;        // null = "No project"
  filePath: string | null;    // null for "No project"
  idPrefix: string;
  tasksFolder: string;        // vault-relative
  schema: FieldDef[];
  statusFieldKey: string;
  doneStatuses: string[];
  dueFieldKey: string | null;
}
```

`TaskTrackerSettings` loses `projects`. Its existing `schema`,
`statusFieldKey`, `doneStatuses`, `dueFieldKey`, `idPrefix` and
`tasksFolder` become the "No project" scope. `mergeSettings` keeps reading
a legacy `projects` array so migration can use it.

### `src/settings/projectRegistry.ts` (new)

- Holds `Map<filePath, ProjectScope>` plus the warnings for each file.
- `rebuild(listFiles, frontmatterOf)` scans every vault Markdown file whose
  path matches `*/Settings/project.md`.
- `update(path)` and `remove(path)` are driven by the same metadata-cache
  `changed`, `delete` and `rename` events `main.ts` already handles.
- `onChange(cb)` notifies subscribers. `main.ts` then rebuilds the task
  index, because the set of task folders may have changed.
- `all()` returns the projects sorted by name. `scopeFor(name | null)`
  returns the project, or the "No project" scope built from settings.
  `scopeForPath(taskPath)` returns the scope whose tasks folder contains the
  task.
- Validation across files: if two projects share an ID prefix or a name,
  both still load, and a warning names both files.

`taskFolders(settings)` becomes
`[settings.tasksFolder, ...registry.all().map(p => p.tasksFolder)]`.

### Migration (`src/settings/migrate.ts`, new)

Migration runs once in `onLayoutReady`, before the first index rebuild.
It runs only when the saved settings still contain a legacy `projects`
array:

1. For each legacy project, the root is the parent of `projectFolder(p)`,
   and `tasksFolder` is the last segment of that folder.
2. If `<root>/Settings/project.md` does not exist, create it with
   `tt-project`, `idPrefix` and `tasksFolder`. Status, done and due settings
   come from the global settings. `fields` copies the global schema, minus
   the `project` field.
3. Existing files are never overwritten.
4. Remove `projects` from settings, remove the global `project` field if
   `ensureProjectField` added it, and save.

A failure on one project raises a Notice and leaves `projects` in
settings, so migration retries on the next load.

### Store and switcher

- `StoreState` gains `project: string | null`. It is saved per device in
  `localStorage`, with try/catch like the list width is.
- `store.setProject(name)` resets `filters` to `{}`. It clears `groupBy`
  when the new scope has no field with that key, and resets `sortKey` to
  `updated` when the old key no longer exists. `search` and `hideDone`
  stay as they are. The selected task is cleared.
- If the saved project no longer exists, the view falls back to
  "No project".
- `FilterBar` gets a project dropdown and a ⚙ button in its first row.
  With no projects, it shows only "No project" and the ⚙ opens plugin
  settings.
- `App` computes `scope = registry.scopeFor(project)`. It shows only the
  tasks whose folder is `scope.tasksFolder`, and passes `scope.schema`,
  `scope.doneStatuses`, `scope.statusFieldKey` and `scope.dueFieldKey`
  where it now passes values from settings.
- Registry warnings for the current project appear as a banner above the
  list. The banner has a link that opens the settings file.

### Task detail

- Uses `registry.scopeForPath(task.path)`.
- Frontmatter keys that are not in the scope's schema and not in the
  reserved set (`id`, `title`, `created`, `updated`, `project`) are shown
  read-only under "Other properties".

### Creating tasks

- `CreateTaskModal` takes the registry and an initial project, which is the
  current switcher value.
- Changing the project dropdown rebuilds the fields section from that
  project's schema. Values typed into fields with the same key are kept.
- On submit, `writer.createTask(title, fields, ids, scope.idPrefix,
  scope.tasksFolder)` runs, and `project: <name>` is still written for
  project tasks.
- `ensureProjectField` and the global `project` select field are removed.

### Creating projects

`CreateProjectModal` (name and prefix, as now) creates `<Name>/Tasks/` and
writes `<Name>/Settings/project.md`. The new file's fields, status, done
and due settings are copied from the "No project" scope. The switcher then
changes to the new project.

### Settings form

- The field-editor section moves out of `SettingsTab.ts` into
  `src/settings/fieldEditor.ts`:
  `renderFieldEditor(containerEl, scope, onChange)`. It covers the fields
  list, add field, status field, done statuses and due field.
- `SettingsTab` uses it for the "No project" scope. The per-project rows
  are replaced by a note that projects live in `<Project>/Settings/project.md`.
- A new `ProjectSettingsModal` shows name (read-only), prefix,
  `tasksFolder`, and then the field editor. Each change goes through
  `app.fileManager.processFrontMatter(file, fm => Object.assign(fm,
  serializeProjectFrontmatter(scope)))`, so the body and any keys the plugin
  doesn't know about are kept.
- When the registry reports a change to the open file, the modal re-renders
  from the new scope.

### Plugin settings

The plugin settings keep:

- `tasksFolder`
- `idPrefix`
- `authorName`
- `schema`
- `statusFieldKey`
- `doneStatuses`
- `dueFieldKey`

All of these except `authorName` are the "No project" scope.

## Error handling summary

| Case | Behaviour |
|---|---|
| Missing `tt-project` / `idPrefix` | File ignored; no project |
| Invalid field | Field skipped; warning banner |
| Unknown `statusField` / `dueField` | Default used; warning |
| Duplicate prefix or name | Both load; warning names both files |
| Settings file deleted | Project leaves the switcher; tasks untouched; view falls back to "No project" if it was current |
| Migration failure | Notice; legacy `projects` kept for retry |
| Unknown frontmatter keys in `project.md` | Preserved on save |

## Testing

Unit tests (vitest) cover:

- `parseProjectFile`: valid file, missing required keys, invalid fields,
  defaults, bad status or due references
- `serializeProjectFrontmatter` round trip with `parseProjectFile`
- `ProjectRegistry`: add, update, remove and rename; duplicate prefix
  warning; `scopeFor`; `scopeForPath`
- Migration: creates files, skips existing ones, strips `projects`, keeps
  it on failure (fake vault adapter)
- `Store.setProject`: which query fields reset and which are kept
- The writer creating a task in a project's folder with its prefix
- `taskFolders` built from the registry

Checked by hand in Obsidian:

- the switcher
- the create modal changing fields when the project changes
- the settings form saving while hand edits reload
- migration of an existing vault

## Out of scope

- An "All projects" view.
- Moving tasks between projects.
- Renaming a project's folder from inside the plugin. Renaming it in the
  file explorer works, because rename events drive the registry.
