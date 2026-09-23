import { describe, expect, it } from 'vitest';
import { pickFieldConfig } from '../../src/settings/fieldConfig';
import { noProjectScope } from '../../src/settings/projectFile';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';

describe('pickFieldConfig', () => {
  it('keeps only the field-editor keys, so an edit never carries stale prefix/folder', () => {
    const scope = { ...noProjectScope(DEFAULT_SETTINGS), idPrefix: 'OLD' };
    const picked = pickFieldConfig(scope);
    expect(Object.keys(picked).sort()).toEqual(['doneStatuses', 'dueFieldKey', 'schema', 'statusFieldKey']);
  });
});
