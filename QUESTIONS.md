# Design Questions — Obsidian Jira-style Task Tracker

**How to answer:** write your answer under each question on the `> ANSWER:` line.
Mark a choice with `[x]`, or just write free text. Skip anything you don't care
about and I'll use the option marked **(rec)** = my recommendation.

---

## 1. Layout / where the UI lives

Obsidian has a real left sidebar (narrow, ~300px, shares space with file
explorer) and a main workspace area (wide, tabbed).

- [ ] **A. Single full-tab "Task Tracker" view (rec)** — opens as a main-area tab
      with its own internal two-pane split: task list on the left of that tab,
      detail on the right. Looks and behaves most like Jira, gets full width,
      no fighting with the file explorer for space.
- [ ] **B. True Obsidian left-sidebar leaf** — task list lives in the actual left
      sidebar; clicking a task opens the detail in the main area. More
      "Obsidian-native", but the list is cramped and filter UI is hard to fit.
- [ ] **C. Both** — sidebar leaf for quick access, plus the full-tab view.

> ANSWER: **(assumed: A)** Single full-tab Task Tracker view with an internal two-pane split. Plus a ribbon icon + command to open it.
A
---

## 2. Does the detail pane replace the normal markdown editor?

When I click a task, the right pane shows structured fields + description +
comments (Jira-like). But each task is also a real `.md` file you may want to
edit as markdown.

- [ ] **A. Custom detail UI, with an "Open as note" button (rec)** — the detail
      pane is fully custom (field widgets, comment box). A button opens the raw
      note in a normal Obsidian tab when you want it.
- [ ] **B. Custom fields header + embedded live markdown editor for description**
      — more work, but you get full markdown editing (links, embeds, autocomplete)
      inline in the description box.
- [ ] **C. Fields only in the custom UI, description/comments always read-only
      preview** — edit those by opening the note.

> ANSWER: **(assumed: A)** Custom detail UI with an "Open as note" button. Description edits via a plain textarea that writes back to the `## Description` section.
A
---

## 3. File format for a task

Proposal — `Tasks/TASK-42 Fix login redirect.md`:

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

Whatever you write here.

## Comments

### Ahmed — 2026-09-21 09:10
First comment body.

### Ahmed — 2026-09-22 11:02
Second comment body.
```

Everything lives in one file: YAML frontmatter for fields, `## Description`
and `## Comments` sections for prose. Filter/search reads frontmatter via
Obsidian's metadata cache (fast, no file reads).

- [ ] **Yes, this format (rec)**
- [ ] Change something — say what below.

> ANSWER: **(assumed: yes)** That file format as written.
Yes
---

## 4. Task filenames / IDs

- [ ] **A. `TASK-42 Short title.md` (rec)** — human-readable in the file
      explorer, ID is stable and visible; renaming the title renames the file.
- [ ] **B. `TASK-42.md`** — title only in frontmatter; file list is opaque but
      renames never touch disk.
- [ ] **C. `Short title.md`** — no visible ID, id lives only in frontmatter.

Also: should the ID prefix be configurable per-vault (e.g. `TASK-`, `OPS-`,
`BUG-`), or fixed as `TASK-`?

> ANSWER: **(assumed: A)** `TASK-42 Short title.md`, and the ID prefix is configurable per-vault in settings (default `TASK`).
A
---

## 5. Custom fields — where does the schema live?

You want a GUI to add fields "to tasks in general". That schema needs a home.

- [ ] **A. Plugin settings (`data.json` in `.obsidian/plugins/...`) (rec)** —
      standard Obsidian practice, invisible to the vault, easy to edit from a
      settings UI.
- [ ] **B. A markdown file in the vault (e.g. `Tasks/_schema.md`)** — version
      controllable alongside your notes, portable, but it's a non-task file
      sitting in the flat Tasks directory and needs parsing.
- [ ] **C. `.obsidian/task-tracker-schema.json`** — in the vault, in git, but out
      of the notes tree.

> ANSWER: **(assumed: A)** Plugin settings `data.json`.
A
---

## 6. Which field types should the field editor support?

Check all you want in v1:

- [ ] Text (single line)
- [ ] Long text / markdown
- [ ] Number
- [ ] Date
- [ ] Select (single choice from a list you define)
- [ ] Multi-select / labels
- [ ] Checkbox (boolean)
- [ ] Person / assignee (from a configured list of names)
- [ ] Link to another task
- [ ] URL

**(rec)** for v1: Text, Number, Date, Select, Multi-select, Checkbox, Person.
Link-to-task and URL can come later.

> ANSWER: **(assumed: rec)** v1 field types: Text, Number, Date, Select, Multi-select, Checkbox, Person. Link-to-task and URL deferred.
Recommended
---

## 7. What happens to existing tasks when you add/remove a field?

- [ ] **A. Lazy (rec)** — new field just appears empty on existing tasks; no files
      are touched until you edit one. Deleting a field from the schema hides it
      in the GUI but leaves the frontmatter key alone (data preserved).
- [ ] **B. Eager migration** — plugin rewrites all task files to add/remove the key.
- [ ] **C. Lazy, but offer a "clean up orphaned fields" button in settings.**

> ANSWER: **(assumed: C)** Lazy, plus a "clean up orphaned frontmatter keys" button in settings.
A
---

## 8. Built-in fields — which are hard-coded vs just default schema entries?

Proposal: only `id`, `title`, `created`, `updated` are hard-coded (the plugin
needs them). `status`, `assignee`, `priority`, `type`, `labels`, `start`, `due`,
`estimate` ship as *default schema entries* that you can rename, reorder, or
delete from the GUI like any custom field.

- [ ] **Yes (rec)**
- [ ] No — keep status/assignee/priority fixed and non-deletable.

> ANSWER: **(assumed: yes)** Only `id`/`title`/`created`/`updated` hard-coded; everything else is a default schema entry you can rename, reorder or delete.
Yes
---

## 9. "Expected timeline" — what exactly do you mean?

- [ ] **A. Start date + Due date (rec)**
- [ ] **B. Due date + effort estimate (e.g. "3d")**
- [ ] **C. Start + Due + estimate + time logged**
- [ ] D. Something else:

Should the detail view show anything computed — days remaining, overdue badge,
a little timeline bar?

> ANSWER: **(assumed: A + estimate)** Start date + Due date, with an optional `estimate` text field. Detail view shows a "due in N days" / overdue badge. No timeline bar in v1.
A
---

## 10. Filtering & search in the sidebar

Which of these in v1?

- [ ] Free-text search over title + description **(rec)**
- [ ] Filter chips per field (status / assignee / priority / any select field) **(rec)**
- [ ] Sort by (due date, priority, updated, created) **(rec)**
- [ ] Group-by header sections (e.g. group by status) **(rec)**
- [ ] Saved filters you can name and re-select
- [ ] A JQL-ish text query language (`status = "In Progress" AND assignee = me`)
- [ ] Quick toggle: hide Done tasks **(rec)**

> ANSWER: **(assumed: rec)** Text search, filter chips, sort, group-by, hide-Done toggle. Saved filters and a query language deferred.
Recommended. Add also component so I can search for example for hw tasks or sw tasks
---

## 11. Comments — who is "me"?

Comments need an author name.

- [ ] **A. One configured "your name" in settings, used as author (rec)** — this is
      a single-user vault; comments are really a chronological work log.
- [ ] **B. A list of team members in settings; pick the author per comment.**
- [ ] C. No author at all, just timestamps.

Should comments be editable/deletable from the GUI after posting, or append-only?

> ANSWER: **(assumed: A)** One configured author name in settings. Comments are editable and deletable from the GUI.
Can each comment have author field? the one who comments, writes his name? so Claude can write author: Claude
---

## 12. Status workflow

- [ ] **A. Status is just a select field with configurable options (rec)** —
      e.g. `Backlog, To Do, In Progress, In Review, Done`. Any status marked
      "done-like" in settings gets the strikethrough/hide-Done behavior.
- [ ] **B. Real workflow with allowed transitions** (can't go Backlog → Done).

> ANSWER: **(assumed: A)** Status is a select field with configurable options; settings marks which options count as "done".
A
---

## 13. Scope — explicitly OUT of v1?

I'd like to leave these out unless you say otherwise:

- Kanban board / drag-drop columns
- Sprints, epics, story points
- Sub-tasks / parent-child hierarchy
- Attachments UI
- Multi-user sync or conflict handling
- Mobile-optimized layout (it will work, but desktop is the target)

Any of these you actually need in v1?

> ANSWER: **(assumed: all out of v1)** No board, sprints, sub-tasks, attachments UI, sync handling, or mobile layout work.
No
---

## 14. Repo / build setup

- [ ] **A. Standard Obsidian plugin scaffold: TypeScript + esbuild, plus Vitest
      for the pure logic (parsing, filtering, schema) (rec)** — UI gets smoke
      tests, logic gets real unit tests.
- [ ] B. Same but no test setup.
- [ ] C. Something else:

Also: is this repo meant to live inside a vault's `.obsidian/plugins/` folder,
or is it a standalone repo you'll symlink/copy into a vault? (If standalone,
what's the path of the vault you'll test against? A build script can copy there
on each build.)

Should I `git init` this repo?

> ANSWER: **(assumed: A)** TypeScript + esbuild + Vitest. Standalone repo, `git init` yes. Build script copies the built plugin into a vault path read from a gitignored `.env` — **tell me your vault path when you have it**, or set `VAULT_PATH=` in `.env` yourself.
A
---

## 15. Anything else

Screenshots of the Jira layout you have in mind, must-have behaviors, pet
peeves, naming preferences for the plugin?

> ANSWER: _(none given)_

add in readme file: https://buymeacoffee.com/a7med7asan15 at the very beginnning