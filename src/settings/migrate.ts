import type { VaultAdapter } from '../write/vault';
import { PROJECT_MARKER, parentOf, projectFilePath, serializeProjectFrontmatter } from './projectFile';
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
  /** Frontmatter of an existing note, to tell our own earlier run from another project. */
  frontmatterOf: (path: string) => Record<string, unknown> | null,
): Promise<MigrationResult> {
  const result: MigrationResult = { created: [], skipped: [], failed: [] };
  const schema = settings.schema.filter((f) => f.key !== PROJECT_KEY);
  const usedRoots = new Set<string>();

  for (const p of settings.projects ?? []) {
    const folder = projectFolder(p);
    try {
      let done = false;
      for (const root of candidateRoots(parentOf(folder), p.name)) {
        if (usedRoots.has(root)) continue;
        const filePath = projectFilePath(root);
        if (await vault.exists(filePath)) {
          // Ours from an earlier, interrupted run: keep it. Anyone else's: look further.
          if (frontmatterOf(filePath)?.[PROJECT_MARKER] !== p.name) continue;
          usedRoots.add(root);
          result.skipped.push(filePath);
          done = true;
          break;
        }
        usedRoots.add(root);
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
        done = true;
        break;
      }
      if (!done) result.failed.push(`${p.name}: no free folder for its settings note`);
    } catch (e) {
      result.failed.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}

/**
 * Where a legacy project's settings note may go, best first: beside its tasks
 * folder, then a folder named after the project (tasksFolder then points back
 * by vault path), then numbered variants of that.
 */
function* candidateRoots(parent: string, name: string): Generator<string> {
  if (parent !== '') yield parent;
  yield name;
  for (let n = 2; n < 100; n++) yield `${name} ${n}`;
}

/** Settings once every project lives in a file: no list, no global project field. */
export function withoutLegacyProjects(settings: TaskTrackerSettings): TaskTrackerSettings {
  const { projects: _migrated, ...rest } = settings;
  return { ...rest, schema: settings.schema.filter((f) => f.key !== PROJECT_KEY) };
}
