export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'person';

export interface FieldDef {
  /** Frontmatter key. Immutable after creation. */
  key: string;
  /** Display name. Freely editable. */
  label: string;
  type: FieldType;
  /** select / multiselect only. */
  options?: string[];
  required?: boolean;
  /** Render as a badge on list rows. */
  showInList?: boolean;
  order: number;
}

export type FieldValue = string | number | boolean | string[] | null;

export type CoerceResult =
  | { ok: true; value: FieldValue }
  | { ok: false; raw: unknown };
