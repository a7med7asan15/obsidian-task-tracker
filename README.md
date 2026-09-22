# Obsidian Task Tracker

A Jira-style task tracker for Obsidian. Tasks are plain markdown files in a
flat folder; filtering, editing and comments happen in a two-pane GUI.

## Features

- Two-pane view: filterable task list, structured detail pane.
- Search, filter chips, sort, group-by, and a hide-done toggle.
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

## Settings

- **Tasks folder** — where task files live. Flat; subfolders are ignored.
- **ID prefix** — `TASK` produces `TASK-1`, `TASK-2`, …
- **Your name** — the author stamped on comments.
- **Fields** — add, rename, reorder, and delete the fields every task has. A
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
