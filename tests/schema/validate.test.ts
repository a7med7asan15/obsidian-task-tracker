import { describe, expect, it } from 'vitest';
import {
  addField, removeField, reorderField, sortedSchema, updateField, validateFieldDef,
} from '../../src/schema/validate';
import type { FieldDef } from '../../src/schema/types';

const base: FieldDef[] = [
  { key: 'status', label: 'Status', type: 'select', options: ['To Do'], order: 0 },
  { key: 'assignee', label: 'Assignee', type: 'person', order: 1 },
];

describe('validateFieldDef', () => {
  it('accepts a well-formed new field', () => {
    expect(validateFieldDef(
      { key: 'severity', label: 'Severity', type: 'select', options: ['S1'], order: 2 }, base,
    )).toEqual([]);
  });

  it('rejects a reserved key', () => {
    const errs = validateFieldDef({ key: 'title', label: 'T', type: 'text', order: 2 }, base);
    expect(errs.join(' ')).toMatch(/reserved/i);
  });

  it('rejects a duplicate key', () => {
    const errs = validateFieldDef({ key: 'status', label: 'S', type: 'text', order: 2 }, base);
    expect(errs.join(' ')).toMatch(/already/i);
  });

  it('rejects a key that is not a valid frontmatter identifier', () => {
    const errs = validateFieldDef({ key: 'two words', label: 'X', type: 'text', order: 2 }, base);
    expect(errs.join(' ')).toMatch(/letters/i);
  });

  it('rejects an empty label', () => {
    const errs = validateFieldDef({ key: 'ok', label: '  ', type: 'text', order: 2 }, base);
    expect(errs.join(' ')).toMatch(/label/i);
  });

  it('requires options on a select field', () => {
    const errs = validateFieldDef({ key: 'sev', label: 'Sev', type: 'select', options: [], order: 2 }, base);
    expect(errs.join(' ')).toMatch(/option/i);
  });

  it('does not require options on a multiselect field', () => {
    expect(validateFieldDef(
      { key: 'tags', label: 'Tags', type: 'multiselect', options: [], order: 2 }, base,
    )).toEqual([]);
  });

  it('rejects duplicate options', () => {
    const errs = validateFieldDef(
      { key: 'sev', label: 'Sev', type: 'select', options: ['a', 'a'], order: 2 }, base,
    );
    expect(errs.join(' ')).toMatch(/duplicate/i);
  });
});

describe('schema mutation', () => {
  it('appends a field with the next order', () => {
    const next = addField(base, { key: 'sev', label: 'Sev', type: 'text', order: 99 });
    expect(next.find((f) => f.key === 'sev')?.order).toBe(2);
    expect(next).toHaveLength(3);
  });

  it('does not mutate the input schema', () => {
    addField(base, { key: 'sev', label: 'Sev', type: 'text', order: 99 });
    expect(base).toHaveLength(2);
  });

  it('updates a field without changing its key', () => {
    const next = updateField(base, 'status', { label: 'State' });
    expect(next.find((f) => f.key === 'status')?.label).toBe('State');
  });

  it('removes a field and closes the order gap', () => {
    const next = removeField(base, 'status');
    expect(next).toHaveLength(1);
    expect(next[0].order).toBe(0);
  });

  it('reorders a field and renumbers the rest contiguously', () => {
    const three = addField(base, { key: 'sev', label: 'Sev', type: 'text', order: 99 });
    const next = sortedSchema(reorderField(three, 'sev', 0));
    expect(next.map((f) => f.key)).toEqual(['sev', 'status', 'assignee']);
    expect(next.map((f) => f.order)).toEqual([0, 1, 2]);
  });

  it('returns the schema unchanged when reordering an unknown key', () => {
    expect(reorderField(base, 'nope', 0)).toEqual(base);
  });
});
