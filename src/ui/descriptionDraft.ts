import type { Task } from '../model/types';

/**
 * Whether leaving the description box should write its draft to disk.
 *
 * Never for a frontmatter-only stub: its empty description means "not read
 * yet", and saving the draft would overwrite the note's real description with
 * whatever the box held -- an empty string, when the pane opened on the stub.
 */
export function shouldSaveDescription(
  task: Pick<Task, 'bodyLoaded' | 'description'>,
  draft: string,
): boolean {
  return task.bodyLoaded && draft !== task.description;
}
