import type { FieldDef } from '../schema/types';

/** A named project. Tasks created under it get IDs starting with `idPrefix`. */
export interface ProjectDef {
  name: string;
  /** ID prefix for tasks in this project, e.g. 'PROJ' produces PROJ-1. */
  idPrefix: string;
}

export interface TaskTrackerSettings {
  /** Vault-relative folder holding task files. Flat; subfolders are ignored. */
  tasksFolder: string;
  /** Default ID prefix when no project is selected, e.g. 'TASK' produces TASK-1. */
  idPrefix: string;
  /** Projects. Each overrides the default prefix for its tasks. */
  projects: ProjectDef[];
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
