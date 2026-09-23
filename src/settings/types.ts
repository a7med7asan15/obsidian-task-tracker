import type { FieldDef } from '../schema/types';

/** A named project. Tasks created under it get IDs starting with `idPrefix`. */
export interface ProjectDef {
  name: string;
  /** ID prefix for tasks in this project, e.g. 'PROJ' produces PROJ-1. */
  idPrefix: string;
  /** Vault-relative folder for this project's tasks. Defaults to `<name>/Tasks`. */
  folder?: string;
}

export interface TaskTrackerSettings {
  /**
   * Vault-relative folder for tasks with no project. Flat; subfolders are
   * ignored. Each project keeps its own tasks in `<project>/Tasks`.
   */
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

/**
 * Everything the view needs to show one project's tasks: its fields,
 * statuses, ID prefix and folder. "No project" is a scope too, built from
 * plugin settings.
 */
export interface ProjectScope {
  /** Null for "No project". */
  name: string | null;
  /** The project's `Settings/project.md`, or null for "No project". */
  filePath: string | null;
  idPrefix: string;
  /** Vault-relative folder holding the project's tasks. */
  tasksFolder: string;
  schema: FieldDef[];
  statusFieldKey: string;
  doneStatuses: string[];
  dueFieldKey: string | null;
}
