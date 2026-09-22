import { describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/ui/store';
import { EMPTY_QUERY } from '../../src/query/apply';

describe('Store', () => {
  it('starts with an empty query and no selection', () => {
    const s = new Store();
    expect(s.getState().query).toEqual(EMPTY_QUERY);
    expect(s.getState().selectedPath).toBeNull();
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
