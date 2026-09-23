import type { FieldDef } from '../schema/types';

/** The part of a scope the field editor edits. */
export interface FieldConfig {
  schema: FieldDef[];
  statusFieldKey: string;
  doneStatuses: string[];
  dueFieldKey: string | null;
}

/**
 * Just the field-editor keys of a larger object (a scope, plugin settings).
 * The editor emits whole configs, so anything else it carried would be a
 * stale copy that overwrites newer edits made elsewhere in the same form.
 */
export function pickFieldConfig(c: FieldConfig): FieldConfig {
  return {
    schema: c.schema,
    statusFieldKey: c.statusFieldKey,
    doneStatuses: c.doneStatuses,
    dueFieldKey: c.dueFieldKey,
  };
}
