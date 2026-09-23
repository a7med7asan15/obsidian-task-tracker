import type { FieldDef, FieldValue } from '../schema/types';

/** Sensible initial value for a field type so the create form opens pre-filled. */
export function defaultValueFor(def: FieldDef): FieldValue {
  switch (def.type) {
    case 'select': {
      const opts = def.options ?? [];
      return opts.length > 0 ? opts[0] : null;
    }
    case 'multiselect':
      return [];
    case 'checkbox':
      return false;
    default:
      return null;
  }
}

/**
 * Values for `schema` when the create form switches project: what was
 * entered carries over where the new project can hold it, everything else
 * starts from its default. Values the form couldn't show are never kept.
 */
export function carryFields(
  previous: Record<string, unknown>,
  schema: FieldDef[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of schema) {
    const prev = previous[def.key];
    const opts = def.options ?? [];
    if (def.type === 'select') {
      out[def.key] = typeof prev === 'string' && opts.includes(prev) ? prev : defaultValueFor(def);
    } else if (def.type === 'multiselect') {
      const values = Array.isArray(prev) ? prev.map(String) : [];
      out[def.key] = opts.length > 0 ? values.filter((v) => opts.includes(v)) : values;
    } else {
      out[def.key] = def.key in previous ? prev : defaultValueFor(def);
    }
  }
  return out;
}
