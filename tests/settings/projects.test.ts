import { describe, expect, it } from 'vitest';
import { ensureProjectField, prefixForProject, suggestPrefix, PROJECT_KEY } from '../../src/settings/projects';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import type { FieldDef } from '../../src/schema/types';

describe('suggestPrefix', () => {
  it('uppercases and strips non-alphanumerics', () => {
    expect(suggestPrefix('My Project!')).toBe('MYPROJECT');
  });

  it('falls back to PROJ when nothing usable remains', () => {
    expect(suggestPrefix('!!!')).toBe('PROJ');
  });

  it('caps the length at 10 characters', () => {
    expect(suggestPrefix('abcdefghijklmnop')).toBe('ABCDEFGHIJ');
  });
});

describe('ensureProjectField', () => {
  it('adds a project select field when none exists', () => {
    const base: FieldDef[] = [{ key: 'status', label: 'Status', type: 'select', options: ['Done'], order: 0 }];
    const next = ensureProjectField(base, [{ name: 'Alpha', idPrefix: 'ALP' }]);
    const f = next.find((x) => x.key === PROJECT_KEY);
    expect(f).toBeDefined();
    expect(f?.type).toBe('select');
    expect(f?.options).toEqual(['Alpha']);
  });

  it('merges new project names into an existing field', () => {
    const base: FieldDef[] = [
      { key: PROJECT_KEY, label: 'Project', type: 'select', options: ['Alpha'], order: 0 },
    ];
    const next = ensureProjectField(base, [
      { name: 'Alpha', idPrefix: 'ALP' },
      { name: 'Beta', idPrefix: 'BET' },
    ]);
    expect(next.find((x) => x.key === PROJECT_KEY)?.options).toEqual(['Alpha', 'Beta']);
  });

  it('leaves the schema untouched when there are no projects and no field', () => {
    const base: FieldDef[] = [{ key: 'status', label: 'Status', type: 'select', options: ['Done'], order: 0 }];
    expect(ensureProjectField(base, [])).toBe(base);
  });
});

describe('prefixForProject', () => {
  it("returns the project's idPrefix", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      projects: [{ name: 'Alpha', idPrefix: 'ALP' }],
    };
    expect(prefixForProject(settings, 'Alpha')).toBe('ALP');
  });

  it('returns undefined for an unknown or empty project', () => {
    expect(prefixForProject(DEFAULT_SETTINGS, 'Nope')).toBeUndefined();
    expect(prefixForProject(DEFAULT_SETTINGS, '')).toBeUndefined();
  });
});
