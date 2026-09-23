import type { LegacyProject } from './types';

/** Frontmatter key carrying the project name on a task. */
export const PROJECT_KEY = 'project';

/** Folder holding a project's tasks: its explicit `folder`, else `<name>/Tasks`. */
export function projectFolder(project: LegacyProject): string {
  const folder = project.folder?.trim().replace(/^\/+|\/+$/g, '');
  return folder && folder.length > 0 ? folder : `${project.name}/Tasks`;
}

/** Derive a suggested ID prefix from a project name: alphanumeric, uppercase. */
export function suggestPrefix(name: string): string {
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 10) : 'PROJ';
}
