# Obsidian Task Tracker — Design

**Date:** 2026-09-21
**Status:** Approved for planning

A Jira-style task tracker for Obsidian. Tasks are plain markdown files in a
flat `Tasks/` folder; all filtering, sorting and editing happens in a custom
GUI. Field definitions are user-editable from that GUI.

## Goals

- A two-pane workspace view: filterable task list on the left, task detail on
  the right.
- Tasks stay readable, greppable markdown that survives without the plugin.
- Users add, rename, reorder and remove task fields from a settings GUI,
  without editing files or code.
- All filtering and processing happens in memory; the vault holds data, not
  view state.

## Non-goals (v1)

Kanban board and drag-drop, sprints/epics/story points, sub-task hierarchy,
attachment management, multi-user sync or conflict resolution, a mobile-tuned
layout, saved filters, and a text query language. Each is a deliberate cut, not
an oversight; the module boundaries below leave room for them later.

## Data format

One file per task in a flat `Tasks/` folder (folder path configurable).

Filename: `TASK-42 Fix login redirect.md`. The ID prefix (`TASK`) is a setting.
The numeric part is allocated as `max(existing ids) + 1` at creation time.

```markdown
---
id: TASK-42
title: Fix login redirect
status: In Progress
assignee: Ahmed
priority: High
type: Bug
labels: [auth, frontend]
start: 2026-09-21
due: 2026-09-28
estimate: 3d
created: 2026-09-21T08:45:00
updated: 2026-09-21T09:10:00
---

## Description

Free markdown.

## Comments

### Ahmed — 2026-09-21T09:10:00
First comment body.

### Ahmed — 2026-09-22T11:02:00
Second comment body, which may
span multiple lines.
```

**Frontmatter** holds every field value. Obsidian's `metadataCache` parses it
for us, so list filtering never reads a file from disk.

**`## Description`** is everything between that heading and the next `##` at
the same level. **`## Comments`** contains `### <author> — <ISO timestamp>`
entries; each comment body runs to the next `###` or the end of file.

Any other content in the file — extra sections, text above `## Description` —
is preserved verbatim on write. The writer only ever replaces the byte ranges
it owns.

### Field identity

Frontmatter keys are the stable identity of a field. Renaming a field's
*label* in the GUI changes the display name only; the key stays put, so no
files are touched and no data moves.

## Field schema

Stored in plugin `data.json` (`.obsidian/plugins/obsidian-task-tracker/`).

```ts
type FieldType =
  | 'text' | 'number' | 'date' | 'select'
  | 'multiselect' | 'checkbox' | 'person';

interface FieldDef {
  key: string;          // frontmatter key, immutable after creation
  label: string;        // display name, freely editable
  type: FieldType;
  options?: string[];   // select / multiselect
  required?: boolean;
  showInList?: boolean; // render as a badge in the list row
  order: number;
}
```

`id`, `title`, `created` and `updated` are hard-coded and never appear in the
schema editor. Everything else — including `status`, `assignee`, `priority`,
`type`, `labels`, `start`, `due`, `estimate` — ships as a *default schema
entry* the user may rename, reorder or delete.

Two settings carry special meaning: which field is the status field, and which
of its options count as "done" (drives the hide-Done toggle and the done
styling).

### Schema changes

Lazy. Adding a field makes it appear, empty, on every task; no file is written
until that task is edited. Deleting a field removes it from the GUI but leaves
the frontmatter key intact, so the data is recoverable by re-adding the field.
A "clean up orphaned frontmatter keys" button in settings scans all tasks,
reports which keys no longer match the schema, and strips them only on
confirmation.

Changing a field's `type` is allowed; existing values that don't coerce are
shown in the detail pane as an "invalid value" state with the raw text
preserved, rather than being silently dropped.

## Architecture

```
main.ts                 plugin lifecycle, view + command + ribbon registration
settings.ts             settings tab: schema editor, folder, prefix, author

schema/                 pure: FieldDef types, defaults, validation, coercion
model/                  pure: parse markdown -> Task, serialize Task -> edits
index/                  TaskIndex over metadataCache; vault event subscriptions
query/                  pure: search, filter, sort, group over Task[]
write/                  the only module that touches the vault
ui/                     Preact components + store
```

Dependency direction is strictly downward: `ui` → `query`/`index`/`write` →
`model`/`schema`. Nothing in `schema`, `model` or `query` imports from
`obsidian`, which is what makes them testable in plain Vitest.

### `model/`

`parseTask(path, frontmatter, content): Task` and a set of *edit* functions
that return a new file body rather than writing it: `setDescription`,
`addComment`, `editComment`, `deleteComment`. Field values go through
`processFrontMatter`, not string surgery.

The parser records the character offsets of the sections it recognises so the
writers can splice precisely and leave the rest of the file untouched.

### `index/`

`TaskIndex` holds `Map<path, Task>` built from `metadataCache.getFileCache()`
for every file under the tasks folder. It subscribes to `vault` create /
modify / rename / delete and `metadataCache.changed`, updating one entry at a
time, then emits a change event the UI store listens to.

Bodies (description, comments) are read lazily — the list only needs
frontmatter, so opening the view on a 2000-task vault reads zero files. The
detail pane reads the one file it's showing.

### `query/`

`applyQuery(tasks, query): Group[]` where `query` carries the search string,
per-field filter values, sort key and direction, group-by field, and the
hide-Done flag. Text search matches title and, when loaded, description. Pure,
synchronous, and the natural home for the heaviest unit tests.

### `write/`

Every mutation funnels through here: create task, set field value, update
description, add/edit/delete comment. It stamps `updated`, handles filename
renames when the title changes, and is the single place where disk contract
mistakes can happen. The UI never calls `vault.modify` directly.

### `ui/`

Preact, mounted into an `ItemView`. A single store object holds the current
query, the selected task path, and the task list; components read from it and
dispatch actions back.

- `TaskTrackerView` — the `ItemView`, owns the Preact root and the store.
- `FilterBar` — search input, filter chips per select/person field, sort and
  group-by pickers, hide-Done toggle.
- `TaskList` — grouped, virtualised-if-needed list of rows; a row shows the
  ID, title, and any field with `showInList`.
- `TaskDetail` — title, field widgets driven by the schema, description
  editor, comment thread, and an "Open as note" button. When a due-date field
  is configured, it also renders a computed "due in N days" / "overdue by N
  days" badge; the same badge appears on list rows.
- `FieldWidget` — one component per `FieldType`, chosen by a small registry so
  adding a type later is a single-file change.
- `CreateTaskModal` — an Obsidian `Modal` rendering the required fields.

## User flows

**Open** — ribbon icon or the "Open Task Tracker" command opens the view as a
main-area tab. Reopening focuses the existing tab rather than creating a second.

**Create** — the "Create issue" button in the filter bar opens the modal, which
shows title plus every `required` field. On submit, `write/` allocates the next
ID, writes the file, and the index event selects the new task in the detail pane.

**Edit a field** — the widget writes on blur (or immediately for selects and
checkboxes) through `write/`, which updates frontmatter and stamps `updated`.
The index event flows back and re-renders; there is no optimistic local copy to
drift out of sync.

**Edit description** — a textarea; writes on blur. A button opens the raw note
in a normal tab for full markdown editing, and the index picks up that edit.

**Comment** — a box at the bottom of the thread appends an entry authored by
the configured name. Existing comments have edit and delete actions.

**Edit the schema** — the settings tab lists fields with drag-to-reorder, and
an "Add field" row for key, label, type and options. Key is fixed after
creation; everything else is editable.

## Error handling

- **Malformed frontmatter** — the task is indexed with whatever parsed plus an
  `parseErrors` marker; the row renders with a warning icon and the detail pane
  shows the raw text instead of widgets. It is never auto-rewritten.
- **Missing `id`** — the file is treated as a task and shown with an "assign
  ID" action rather than being hidden, so dropping a note into `Tasks/` is a
  recoverable mistake, not an invisible one.
- **Duplicate `id`** — both are listed; the detail pane warns. ID allocation
  skips over any existing max, so this only arises from manual editing.
- **Write failures** — surfaced as an Obsidian `Notice`; the index is
  re-synced from disk so the UI never shows a value that isn't on disk.
- **Title rename collision** — if the target filename exists, the write keeps
  the old filename and updates only the frontmatter title, with a notice.

## Testing

Vitest for the pure modules, which is where the real risk lives:

- `schema/` — validation, coercion of each type, default schema shape.
- `model/` — round-trip parse → serialize for well-formed files; preservation
  of unknown sections; comment parsing including multi-line bodies and
  `###`-like text inside a body; malformed input.
- `query/` — filter combinations, sort stability, grouping, hide-Done,
  search matching.
- `write/` — against an in-memory fake of the small vault interface it needs,
  asserting exactly which bytes change.

`index/` and `ui/` get thin smoke tests only; they need the Obsidian runtime,
and manual verification in a real vault is the honest check for them.

## Build and repo

Standard Obsidian plugin scaffold: TypeScript, esbuild bundling to `main.js`,
`manifest.json` and `styles.css` at the repo root. Preact is bundled, not
externalised. `obsidian` is an esbuild external.

A dev build watches and copies `main.js`, `manifest.json` and `styles.css` into
`$VAULT_PATH/.obsidian/plugins/obsidian-task-tracker/`, where `VAULT_PATH`
comes from a gitignored `.env`. **Open question:** the vault path to test
against is not yet set; the first build will need it.

## Open questions

1. Vault path for the dev copy step (`VAULT_PATH` in `.env`).
2. Whether the list needs virtualisation in v1 — deferred until a real vault
   shows a problem; the row component is kept cheap so it can be added without
   restructuring.
