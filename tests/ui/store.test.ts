import { describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/ui/store';
import { EMPTY_QUERY } from '../../src/query/apply';

describe('Store', () => {
  it('starts with an empty query and no selection', () => {
    const s = new Store();
    expect(s.getState().query).toEqual(EMPTY_QUERY);
    expect(s.getState().selectedPath).toBeNull();
    expect(s.getState().project).toBeNull();
  });

  it('patches the query without dropping other keys', () => {
    const s = new Store();
    s.setQuery({ search: 'login' });
    s.setQuery({ hideDone: true });
    expect(s.getState().query.search).toBe('login');
    expect(s.getState().query.hideDone).toBe(true);
  });

  it('notifies subscribers on change', () => {
    const s = new Store();
    const cb = vi.fn();
    s.subscribe(cb);
    s.setQuery({ search: 'x' });
    s.select('Tasks/TASK-1 A.md');
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const s = new Store();
    const cb = vi.fn();
    s.subscribe(cb)();
    s.setQuery({ search: 'x' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('toggles a filter value on and off', () => {
    const s = new Store();
    s.toggleFilter('status', 'Done');
    expect(s.getState().query.filters.status).toEqual(['Done']);
    s.toggleFilter('status', 'Done');
    expect(s.getState().query.filters.status).toEqual([]);
  });
});

describe('Store.clearFilter', () => {
  it('drops one field filter and keeps the others', () => {
    const s = new Store();
    s.toggleFilter('sprint', 'HS1');
    s.toggleFilter('status', 'Done');
    s.clearFilter('sprint');
    expect(s.getState().query.filters).toEqual({ status: ['Done'] });
  });
});

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
