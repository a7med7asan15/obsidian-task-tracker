import type { VaultAdapter } from '../write/vault';
import { parentOf, projectFilePath, serializeProjectFrontmatter } from './projectFile';
import { PROJECT_KEY, projectFolder } from './projects';
import type { ProjectScope, TaskTrackerSettings } from './types';

export const PROJECT_FILE_BODY =
  'Settings for this Task Tracker project. Edit the properties above, '
  + 'or use the ⚙ button next to the project picker in the tracker.\n';

/** Create a settings file for `scope`. Fails if the file already exists. */
export async function writeProjectFile(
  vault: VaultAdapter,
  filePath: string,
  scope: ProjectScope,
): Promise<void> {
  await vault.create(filePath, PROJECT_FILE_BODY);
  await vault.processFrontmatter(filePath, (fm) => {
    Object.assign(fm, serializeProjectFrontmatter({ ...scope, filePath }));
  });
}

export interface MigrationResult {
  created: string[];
  /** Settings files that already existed and were left alone. */
  skipped: string[];
  /** "<project>: <error>" for each project that could not be written. */
  failed: string[];
}

/**
 * Give every legacy project in plugin settings its own Settings/project.md,
 * next to its tasks folder. The project inherits the global fields, which
 * is what it was using until now.
 */
export async function migrateLegacyProjects(
  vault: VaultAdapter,
  settings: TaskTrackerSettings,
): Promise<MigrationResult> {
  const result: MigrationResult = { created: [], skipped: [], failed: [] };
  const schema = settings.schema.filter((f) => f.key !== PROJECT_KEY);
  const usedRoots = new Set<string>();

  for (const p of settings.projects ?? []) {
    const folder = projectFolder(p);
    const parent = parentOf(folder);
    // A folder at the vault root has no parent to hold Settings/, and two
    // projects under one parent can't share a file: those get a root of
    // their own, and their tasksFolder points back by vault path.
    const root = parent !== '' && !usedRoots.has(parent) ? parent : p.name;
    usedRoots.add(root);
    const filePath = projectFilePath(root);
    try {
      if (await vault.exists(filePath)) {
        result.skipped.push(filePath);
        continue;
      }
      await writeProjectFile(vault, filePath, {
        name: p.name,
        filePath,
        idPrefix: p.idPrefix,
        tasksFolder: folder,
        schema,
        statusFieldKey: settings.statusFieldKey,
        doneStatuses: settings.doneStatuses,
        dueFieldKey: settings.dueFieldKey,
      });
      result.created.push(filePath);
    } catch (e) {
      result.failed.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

/** Settings once every project lives in a file: no list, no global project field. */
export function withoutLegacyProjects(settings: TaskTrackerSettings): TaskTrackerSettings {
  const { projects: _migrated, ...rest } = settings;
  return { ...rest, schema: settings.schema.filter((f) => f.key !== PROJECT_KEY) };
}
