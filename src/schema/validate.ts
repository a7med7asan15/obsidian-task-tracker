import { RESERVED_KEYS } from './defaults';
import type { FieldDef } from './types';

const KEY_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;

export function validateFieldDef(def: FieldDef, existing: FieldDef[]): string[] {
  const errors: string[] = [];

  if (!KEY_RE.test(def.key)) {
    errors.push('Key must start with a letter and contain only letters, numbers, hyphens or underscores.');
  }
  if ((RESERVED_KEYS as readonly string[]).includes(def.key)) {
    errors.push(`"${def.key}" is a reserved key.`);
  }
  if (existing.some((f) => f.key === def.key)) {
    errors.push(`A field with the key "${def.key}" already exists.`);
  }
  if (def.label.trim().length === 0) {
    errors.push('Label cannot be empty.');
  }
  if (def.type === 'select' && (def.options ?? []).length === 0) {
    errors.push('A select field needs at least one option.');
  }
  const options = def.options ?? [];
  if (new Set(options).size !== options.length) {
    errors.push('Options contain duplicates.');
  }

  return errors;
}

function renumber(schema: FieldDef[]): FieldDef[] {
  return [...schema]
    .sort((a, b) => a.order - b.order)
    .map((f, i) => ({ ...f, order: i }));
}

export function sortedSchema(schema: FieldDef[]): FieldDef[] {
  return [...schema].sort((a, b) => a.order - b.order);
}

export function addField(schema: FieldDef[], def: FieldDef): FieldDef[] {
  return renumber([...schema, { ...def, order: schema.length }]);
}

export function updateField(
  schema: FieldDef[],
  key: string,
  patch: Partial<Omit<FieldDef, 'key'>>,
): FieldDef[] {
  return schema.map((f) => (f.key === key ? { ...f, ...patch, key: f.key } : f));
}

export function removeField(schema: FieldDef[], key: string): FieldDef[] {
  return renumber(schema.filter((f) => f.key !== key));
}

export function reorderField(schema: FieldDef[], key: string, newOrder: number): FieldDef[] {
  const sorted = sortedSchema(schema);
  const from = sorted.findIndex((f) => f.key === key);
  if (from === -1) return schema;
  const [moved] = sorted.splice(from, 1);
  const to = Math.max(0, Math.min(newOrder, sorted.length));
  sorted.splice(to, 0, moved);
  return sorted.map((f, i) => ({ ...f, order: i }));
}
