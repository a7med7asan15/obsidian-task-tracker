# Obsidian Task Tracker

## Support

If you find this plugin useful, you can support its development here:
https://buymeacoffee.com/a7med7asan15

A Jira-style task tracker for Obsidian. Tasks are plain markdown files in a
flat folder; filtering, editing and comments happen in a two-pane GUI.

## Features

- Two-pane view: filterable task list, structured detail pane.
- Search, collapsible filter dropdowns, sort, group-by, and a hide-done toggle.
- Drag the divider to resize the list; in a narrow pane the list and the
  detail view take turns.
- Fields you define yourself from settings — text, number, date, select,
  multi-select, checkbox, person.
- Comments with author and timestamp, editable in place.
- Every task is a normal markdown file that still reads well without the plugin.

## Task file format

```markdown
---
id: TASK-42
title: Fix login redirect
status: In Progress
assignee: Ahmed
due: 2026-09-28
created: 2026-09-21T08:45:00
updated: 2026-09-21T09:10:00
---

## Description

The redirect loops when the session cookie is stale.

## Comments

### Ahmed — 2026-09-21T09:10:00
Reproduced on staging.
```

Anything else you write in the file is left alone by the plugin.

Section boundaries (`## Description`, `## Comments`, ...) are found by
scanning for the next top-level `## ` heading. If you type a `## ` heading
of your own inside a description or comment, the plugin demotes it to `### `
when saving so it can't be mistaken for a section boundary — your heading
and its text are kept, just one level down.

## Settings

- **Tasks folder** — where tasks without a project live. Flat; subfolders are ignored.
- **Projects** — each project is a folder with a settings note and a tasks
  folder. The note's properties define the project: its name, ID prefix, and
  its own fields, statuses, and due field. Edit them by hand, or with the ⚙
  button next to the project picker in the tracker. A vault with two projects
  looks like:

  ```
  Tasks/                          tasks with no project (TASK-1, …)
  Project1/Settings/project.md    tt-project: Project1, idPrefix: PROJ1, fields: …
  Project1/Tasks/                 PROJ1-1, PROJ1-2, …
  Project2/Settings/project.md
  Project2/Tasks/                 PROJ2-1, …
  ```

  Projects created before settings notes existed are moved into notes the
  first time the plugin starts.
- **ID prefix** — `TASK` produces `TASK-1`, `TASK-2`, …
- **Your name** — the author stamped on comments.
- **Fields** — add, rename, reorder, and delete the fields of tasks without a
  project (each project has its own, in its settings note). A
  field's key is its frontmatter key and is fixed once created; its label is
  free to change.
- **Status field / done statuses** — which field drives "hide done".
- **Due date field** — drives the due and overdue badges.

Deleting a field hides it but leaves the data in your files. Use
**Clean up orphaned frontmatter keys** when you want it gone for good.

## Development

```bash
npm install
cp .env.example .env   # set VAULT_PATH to the vault you test against
npm run dev            # watch build, copies into the vault on each rebuild
npm test               # unit tests
npm run typecheck
```

`docs/manual-test.md` is the checklist for the parts unit tests can't reach.
