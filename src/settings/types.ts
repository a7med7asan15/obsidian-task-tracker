import type { FieldDef } from '../schema/types';

export interface TaskTrackerSettings {
  /** Vault-relative folder holding task files. Flat; subfolders are ignored. */
  tasksFolder: string;
  /** ID prefix, e.g. 'TASK' produces TASK-1. */
  idPrefix: string;
  /** Author name stamped on comments. */
  authorName: string;
  schema: FieldDef[];
  /** Which schema field carries status. */
  statusFieldKey: string;
  /** Options of the status field that count as done. */
  doneStatuses: string[];
  /** Which schema field drives the due badge, or null to disable it. */
  dueFieldKey: string | null;
}
