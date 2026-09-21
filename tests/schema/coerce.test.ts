import { describe, expect, it } from 'vitest';
import { coerceValue, isEmpty } from '../../src/schema/coerce';
import type { FieldDef } from '../../src/schema/types';

const def = (over: Partial<FieldDef>): FieldDef => ({
  key: 'f', label: 'F', type: 'text', order: 0, ...over,
});

describe('coerceValue', () => {
  it('passes through text', () => {
    expect(coerceValue(def({ type: 'text' }), 'hello')).toEqual({ ok: true, value: 'hello' });
  });

  it('stringifies non-string text values', () => {
    expect(coerceValue(def({ type: 'text' }), 42)).toEqual({ ok: true, value: '42' });
  });

  it('parses numeric strings for number fields', () => {
    expect(coerceValue(def({ type: 'number' }), '3.5')).toEqual({ ok: true, value: 3.5 });
  });

  it('rejects non-numeric text for number fields', () => {
    expect(coerceValue(def({ type: 'number' }), 'abc')).toEqual({ ok: false, raw: 'abc' });
  });

  it('accepts YYYY-MM-DD dates', () => {
    expect(coerceValue(def({ type: 'date' }), '2026-09-21')).toEqual({ ok: true, value: '2026-09-21' });
  });

  it('rejects malformed dates', () => {
    expect(coerceValue(def({ type: 'date' }), '21/09/2026')).toEqual({ ok: false, raw: '21/09/2026' });
  });

  it('rejects calendar-invalid dates', () => {
    expect(coerceValue(def({ type: 'date' }), '2026-02-30')).toEqual({ ok: false, raw: '2026-02-30' });
  });

  it('accepts a select value that is in options', () => {
    const d = def({ type: 'select', options: ['To Do', 'Done'] });
    expect(coerceValue(d, 'Done')).toEqual({ ok: true, value: 'Done' });
  });

  it('rejects a select value outside options', () => {
    const d = def({ type: 'select', options: ['To Do', 'Done'] });
    expect(coerceValue(d, 'Nope')).toEqual({ ok: false, raw: 'Nope' });
  });

  it('wraps a bare string into a multiselect array', () => {
    const d = def({ type: 'multiselect', options: ['a', 'b'] });
    expect(coerceValue(d, 'a')).toEqual({ ok: true, value: ['a'] });
  });

  it('rejects a multiselect array containing an unknown option', () => {
    const d = def({ type: 'multiselect', options: ['a', 'b'] });
    expect(coerceValue(d, ['a', 'z'])).toEqual({ ok: false, raw: ['a', 'z'] });
  });

  it('coerces truthy strings to checkbox booleans', () => {
    expect(coerceValue(def({ type: 'checkbox' }), 'true')).toEqual({ ok: true, value: true });
    expect(coerceValue(def({ type: 'checkbox' }), false)).toEqual({ ok: true, value: false });
  });

  it('rejects unrecognised checkbox values', () => {
    expect(coerceValue(def({ type: 'checkbox' }), 'maybe')).toEqual({ ok: false, raw: 'maybe' });
  });

  it('treats person as free text', () => {
    expect(coerceValue(def({ type: 'person' }), 'Ahmed')).toEqual({ ok: true, value: 'Ahmed' });
  });

  it('maps null and undefined to a null value for every type', () => {
    expect(coerceValue(def({ type: 'number' }), null)).toEqual({ ok: true, value: null });
    expect(coerceValue(def({ type: 'select', options: ['a'] }), undefined)).toEqual({ ok: true, value: null });
  });

  it('maps empty string to null', () => {
    expect(coerceValue(def({ type: 'text' }), '')).toEqual({ ok: true, value: null });
  });
});

describe('isEmpty', () => {
  it('treats null and empty collections as empty', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty('')).toBe(true);
  });

  it('treats false and zero as present', () => {
    expect(isEmpty(false)).toBe(false);
    expect(isEmpty(0)).toBe(false);
  });
});
