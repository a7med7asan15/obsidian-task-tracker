import { describe, expect, it } from 'vitest';
import { orphanKeys } from '../../src/settings/orphans';
import type { ProjectScope } from '../../src/settings/types';
import type { Task } from '../../src/model/types';

const task = (path: string, fields: Record<string, unknown>): Task => ({
  path, id: null, title: '', fields, description: '', comments: [],
  created: null, updated: null, parseErrors: [],
});

const scope = (keys: string[]): ProjectScope => ({
  name: null, filePath: null, idPrefix: 'T', tasksFolder: 'Tasks',
  schema: keys.map((key, order) => ({ key, label: key, type: 'text', order })),
  statusFieldKey: 'status', doneStatuses: [], dueFieldKey: null,
});

describe('orphanKeys', () => {
  it("checks each task against its own project's fields", () => {
    const scopes: Record<string, ProjectScope> = {
      Tasks: scope(['status']),
      'Alpha/Tasks': scope(['status', 'sprint']),
    };
    const orphans = orphanKeys(
      [
        task('Tasks/T-1.md', { status: 'x', sprint: 'S1' }),
        task('Alpha/Tasks/A-1.md', { status: 'x', sprint: 'S1', project: 'Alpha', old: 1 }),
      ],
      (path) => scopes[path.slice(0, path.lastIndexOf('/'))],
    );
    expect(orphans).toEqual(new Map([
      ['sprint', ['Tasks/T-1.md']],
      ['old', ['Alpha/Tasks/A-1.md']],
    ]));
  });

  it("never calls a field orphaned just because the settings note's entry for it was skipped", () => {
    const alpha = { ...scope(['status']), skippedFields: [{ index: 1, raw: { key: 'sprint', type: 'selct' } }] };
    expect(orphanKeys([task('Alpha/Tasks/A-1.md', { status: 'x', sprint: 'S1' })], () => alpha)).toEqual(new Map());
  });
});
