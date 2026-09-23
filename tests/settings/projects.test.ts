import { describe, expect, it } from 'vitest';
import { projectFolder, suggestPrefix } from '../../src/settings/projects';

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

describe('projectFolder', () => {
  it('defaults to <name>/Tasks and trims slashes off an explicit folder', () => {
    expect(projectFolder({ name: 'Shahin NPU', idPrefix: 'SHN' })).toBe('Shahin NPU/Tasks');
    expect(projectFolder({ name: 'Web', idPrefix: 'WEB', folder: '/Work/Web Tasks/' })).toBe('Work/Web Tasks');
  });
});
