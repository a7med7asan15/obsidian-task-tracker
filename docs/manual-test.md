# Manual test checklist

Run after any change to the view, the vault adapter, or the index wiring.

## Opening
- [ ] Ribbon icon opens the Task Tracker tab.
- [ ] "Open Task Tracker" command opens it.
- [ ] Running the command twice focuses the existing tab rather than opening a second.

## Creating
- [ ] "Create issue" opens the modal with the title focused.
- [ ] Submitting with an empty title shows a notice and does not create a file.
- [ ] Submitting creates `Tasks/TASK-1 <title>.md` with frontmatter, Description and Comments sections.
- [ ] The new task is selected in the detail pane.
- [ ] Creating a second task allocates TASK-2.
- [ ] Deleting TASK-2 in the file explorer and creating again allocates TASK-3, not TASK-2.

## Listing and filtering
- [ ] Typing in search narrows the list.
- [ ] Search matches a word that appears only in a task's description.
- [ ] Clicking a status chip filters; clicking again clears it.
- [ ] Two chips in the same field OR together.
- [ ] A status chip plus an assignee filter AND together.
- [ ] Sort by due date orders correctly, and the direction button reverses it.
- [ ] Tasks with no due date sort last in both directions.
- [ ] Group by status shows groups in schema option order.
- [ ] "Hide done" removes Done tasks.

## Detail pane
- [ ] Clicking a row shows its fields, description and comments.
- [ ] Changing a select writes to frontmatter immediately.
- [ ] Editing a text field writes on blur.
- [ ] Clearing a field removes the key from frontmatter.
- [ ] Editing the title renames the file and keeps the task selected.
- [ ] Editing the title to collide with an existing filename keeps the old filename and shows no data loss.
- [ ] Editing the description writes only the Description section.
- [ ] A hand-written `## Notes` section survives a description edit.
- [ ] `updated` changes on every edit.

## Comments
- [ ] Adding a comment appends it with the configured author name.
- [ ] A multi-line comment round-trips.
- [ ] Editing a comment changes only that comment.
- [ ] Deleting a comment leaves the others intact.

## Editing outside the plugin
- [ ] "Open as note" opens the raw markdown.
- [ ] Editing frontmatter in the note updates the list within a second.
- [ ] Adding a task file by hand makes it appear in the list.
- [ ] A file in `Tasks/` with no `id` appears with a warning rather than vanishing.
- [ ] "Assign an ID" on that file writes the next free ID and clears the warning.
- [ ] Two files sharing an ID both appear, and the detail pane warns on each.
- [ ] Malformed frontmatter shows the warning state and is not rewritten.

## Schema editing
- [ ] Adding a field makes it appear on every task's detail pane, empty.
- [ ] A duplicate or reserved key is rejected with a notice.
- [ ] Renaming a field's label changes the GUI and touches no files.
- [ ] Reordering a field reorders it in the detail pane.
- [ ] Deleting a field hides it but leaves the frontmatter key in the file.
- [ ] "Clean up orphaned keys" finds that key, asks for confirmation, and removes it.
- [ ] Changing the tasks folder re-indexes against the new folder.
