import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from '../../src/settings/defaults';

describe('DEFAULT_SETTINGS', () => {
  it('points at a flat Tasks folder', () => {
    expect(DEFAULT_SETTINGS.tasksFolder).toBe('Tasks');
  });

  it('names a status field that exists in the default schema', () => {
    expect(DEFAULT_SETTINGS.schema.some((f) => f.key === DEFAULT_SETTINGS.statusFieldKey)).toBe(true);
  });

  it('marks Done as a done status', () => {
    expect(DEFAULT_SETTINGS.doneStatuses).toContain('Done');
  });

  it('starts with no projects', () => {
    expect(DEFAULT_SETTINGS.projects).toEqual([]);
  });
});

describe('mergeSettings', () => {
  it('returns defaults for null', () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for a non-object', () => {
    expect(mergeSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps saved scalar values', () => {
    const merged = mergeSettings({ idPrefix: 'OPS', authorName: 'Ahmed' });
    expect(merged.idPrefix).toBe('OPS');
    expect(merged.authorName).toBe('Ahmed');
    expect(merged.tasksFolder).toBe('Tasks');
  });

  it('keeps a saved schema rather than merging it with defaults', () => {
    const merged = mergeSettings({ schema: [{ key: 'only', label: 'Only', type: 'text', order: 0 }] });
    expect(merged.schema).toHaveLength(1);
    expect(merged.schema[0].key).toBe('only');
  });

  it('falls back to the default schema when the saved one is not an array', () => {
    expect(mergeSettings({ schema: 'oops' }).schema).toEqual(DEFAULT_SETTINGS.schema);
  });

  it('falls back to the default schema when the saved one is empty', () => {
    expect(mergeSettings({ schema: [] }).schema).toEqual(DEFAULT_SETTINGS.schema);
  });

  it('keeps valid saved projects', () => {
    const merged = mergeSettings({ projects: [{ name: 'Alpha', idPrefix: 'ALP' }] });
    expect(merged.projects).toEqual([{ name: 'Alpha', idPrefix: 'ALP' }]);
  });

  it('drops malformed project entries and non-array values', () => {
    expect(mergeSettings({ projects: 'nope' }).projects).toEqual([]);
    expect(mergeSettings({ projects: [{ name: '', idPrefix: 'X' }, null, 3] }).projects).toEqual([]);
  });
});
