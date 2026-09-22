import { describe, expect, it } from 'vitest';
import { dueBadge } from '../../src/ui/dates';

const today = new Date(2026, 8, 21);

describe('dueBadge', () => {
  it('returns null when there is no due date', () => {
    expect(dueBadge(null, today)).toBeNull();
  });

  it('returns null for a malformed due date', () => {
    expect(dueBadge('not-a-date', today)).toBeNull();
  });

  it('reports today', () => {
    expect(dueBadge('2026-09-21', today)).toEqual({ text: 'Due today', tone: 'soon' });
  });

  it('reports tomorrow in the singular', () => {
    expect(dueBadge('2026-09-22', today)).toEqual({ text: 'Due in 1 day', tone: 'soon' });
  });

  it('reports a comfortable future date as normal', () => {
    expect(dueBadge('2026-09-28', today)).toEqual({ text: 'Due in 7 days', tone: 'normal' });
  });

  it('reports overdue dates', () => {
    expect(dueBadge('2026-09-19', today)).toEqual({ text: 'Overdue by 2 days', tone: 'overdue' });
  });

  it('uses the singular for one day overdue', () => {
    expect(dueBadge('2026-09-20', today)).toEqual({ text: 'Overdue by 1 day', tone: 'overdue' });
  });
});
