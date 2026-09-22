import { describe, expect, it } from 'vitest';
import { EMPTY_QUERY, applyQuery } from '../../src/query/apply';
import type { Query } from '../../src/query/types';
import type { Task } from '../../src/model/types';
import type { FieldDef } from '../../src/schema/types';

const schema: FieldDef[] = [
  { key: 'status', label: 'Status', type: 'select', options: ['To Do', 'In Progress', 'Done'], order: 0 },
  { key: 'assignee', label: 'Assignee', type: 'person', order: 1 },
  { key: 'due', label: 'Due', type: 'date', order: 2 },
];

const task = (over: Partial<Task> & { id: string }): Task => ({
  path: `Tasks/${over.id}.md`,
  title: over.id,
  fields: {},
  description: '',
  comments: [],
  created: null,
  updated: null,
  parseErrors: [],
  ...over,
});

const tasks: Task[] = [
  task({ id: 'TASK-1', title: 'Fix login redirect', fields: { status: 'In Progress', assignee: 'Ahmed', due: '2026-09-25' }, updated: '2026-09-20T10:00:00' }),
  task({ id: 'TASK-2', title: 'Update docs', description: 'Mentions login flow.', fields: { status: 'To Do', assignee: 'Sam', due: '2026-09-22' }, updated: '2026-09-21T10:00:00' }),
  task({ id: 'TASK-3', title: 'Ship release', fields: { status: 'Done', assignee: 'Ahmed', due: '2026-09-19' }, updated: '2026-09-19T10:00:00' }),
];

const q = (over: Partial<Query> = {}): Query => ({ ...EMPTY_QUERY, ...over });
const run = (query: Query) => applyQuery(tasks, query, schema, ['Done'], 'status');
const idsOf = (groups: { tasks: Task[] }[]) => groups.flatMap((g) => g.tasks.map((t) => t.id));

describe('applyQuery', () => {
  it('returns every task in one group by default', () => {
    const groups = run(q());
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks).toHaveLength(3);
  });

  it('matches search against the title, case-insensitively', () => {
    expect(idsOf(run(q({ search: 'LOGIN redirect' })))).toEqual(['TASK-1']);
  });

  it('matches search against the description', () => {
    expect(idsOf(run(q({ search: 'login flow' })))).toContain('TASK-2');
  });

  it('matches search against the id', () => {
    expect(idsOf(run(q({ search: 'task-3' })))).toEqual(['TASK-3']);
  });

  it('ORs values within one filter field', () => {
    const ids = idsOf(run(q({ filters: { status: ['To Do', 'Done'] } })));
    expect(ids.sort()).toEqual(['TASK-2', 'TASK-3']);
  });

  it('ANDs across filter fields', () => {
    const ids = idsOf(run(q({ filters: { status: ['Done'], assignee: ['Ahmed'] } })));
    expect(ids).toEqual(['TASK-3']);
  });

  it('ignores a filter field with an empty value list', () => {
    expect(idsOf(run(q({ filters: { status: [] } })))).toHaveLength(3);
  });

  it('hides done tasks when asked', () => {
    const ids = idsOf(run(q({ hideDone: true })));
    expect(ids).not.toContain('TASK-3');
    expect(ids).toHaveLength(2);
  });

  it('sorts by a date field ascending', () => {
    expect(idsOf(run(q({ sortKey: 'due', sortDir: 'asc' }))))
      .toEqual(['TASK-3', 'TASK-2', 'TASK-1']);
  });

  it('sorts descending', () => {
    expect(idsOf(run(q({ sortKey: 'due', sortDir: 'desc' }))))
      .toEqual(['TASK-1', 'TASK-2', 'TASK-3']);
  });

  it('sorts empty values last regardless of direction', () => {
    const withBlank = [...tasks, task({ id: 'TASK-4', fields: { status: 'To Do' } })];
    const asc = applyQuery(withBlank, q({ sortKey: 'due', sortDir: 'asc' }), schema, ['Done'], 'status');
    const desc = applyQuery(withBlank, q({ sortKey: 'due', sortDir: 'desc' }), schema, ['Done'], 'status');
    expect(idsOf(asc).at(-1)).toBe('TASK-4');
    expect(idsOf(desc).at(-1)).toBe('TASK-4');
  });

  it('sorts by title when sortKey is title', () => {
    expect(idsOf(run(q({ sortKey: 'title', sortDir: 'asc' }))))
      .toEqual(['TASK-1', 'TASK-3', 'TASK-2']);
  });

  it('groups by a field, one group per distinct value', () => {
    const groups = run(q({ groupBy: 'assignee' }));
    expect(groups.map((g) => g.key).sort()).toEqual(['Ahmed', 'Sam']);
    expect(groups.find((g) => g.key === 'Ahmed')?.tasks).toHaveLength(2);
  });

  it('puts tasks with no value into a "No value" group, last', () => {
    const withBlank = [...tasks, task({ id: 'TASK-4' })];
    const groups = applyQuery(withBlank, q({ groupBy: 'assignee' }), schema, ['Done'], 'status');
    expect(groups.at(-1)?.key).toBe('No value');
  });

  it('orders status groups by the schema option order, not alphabetically', () => {
    const groups = run(q({ groupBy: 'status' }));
    expect(groups.map((g) => g.key)).toEqual(['To Do', 'In Progress', 'Done']);
  });

  it('combines search, filter and sort', () => {
    const ids = idsOf(run(q({ search: 'a', filters: { assignee: ['Ahmed'] }, sortKey: 'due', sortDir: 'asc' })));
    expect(ids).toEqual(['TASK-3', 'TASK-1']);
  });

  it('does not mutate the input array', () => {
    const before = tasks.map((t) => t.id);
    run(q({ sortKey: 'due', sortDir: 'desc' }));
    expect(tasks.map((t) => t.id)).toEqual(before);
  });
});
