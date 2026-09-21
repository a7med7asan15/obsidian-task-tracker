import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEMA, RESERVED_KEYS } from '../../src/schema/defaults';

describe('DEFAULT_SCHEMA', () => {
  it('contains no reserved keys', () => {
    for (const f of DEFAULT_SCHEMA) {
      expect(RESERVED_KEYS).not.toContain(f.key);
    }
  });

  it('has unique keys', () => {
    const keys = DEFAULT_SCHEMA.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has contiguous order values starting at 0', () => {
    const orders = DEFAULT_SCHEMA.map((f) => f.order).sort((a, b) => a - b);
    expect(orders).toEqual(orders.map((_, i) => i));
  });

  it('ships status as a select with options', () => {
    const status = DEFAULT_SCHEMA.find((f) => f.key === 'status');
    expect(status?.type).toBe('select');
    expect(status?.options).toContain('In Progress');
  });
});
