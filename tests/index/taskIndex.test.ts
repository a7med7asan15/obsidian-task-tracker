import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskIndex, type MetadataSource } from '../../src/index/taskIndex';

class FakeSource implements MetadataSource {
  files = new Map<string, { fm: Record<string, unknown>; content: string }>();
  pathsIn(folder: string) {
    return [...this.files.keys()].filter((p) => p.startsWith(`${folder}/`));
  }
  frontmatterOf(path: string) {
    return this.files.get(path)?.fm ?? null;
  }
  async read(path: string) {
    const f = this.files.get(path);
    if (!f) throw new Error(`no such file: ${path}`);
    return f.content;
  }
  add(path: string, fm: Record<string, unknown>, content = '') {
    this.files.set(path, { fm, content });
  }
}

let source: FakeSource;
let index: TaskIndex;

beforeEach(() => {
  source = new FakeSource();
  source.add('Tasks/TASK-1 A.md', { id: 'TASK-1', title: 'A', status: 'To Do' });
  source.add('Tasks/TASK-2 B.md', { id: 'TASK-2', title: 'B', status: 'Done' });
  source.add('Notes/not-a-task.md', { title: 'Nope' });
  index = new TaskIndex(source, () => ['Tasks']);
});

describe('TaskIndex', () => {
  it('indexes only files under the tasks folder', async () => {
    await index.rebuild();
    expect(index.all()).toHaveLength(2);
    expect(index.all().map((t) => t.id).sort()).toEqual(['TASK-1', 'TASK-2']);
  });

  it('does not read file bodies during rebuild', async () => {
    const spy = vi.spyOn(source, 'read');
    await index.rebuild();
    expect(spy).not.toHaveBeenCalled();
  });

  it('exposes ids for id allocation', async () => {
    await index.rebuild();
    expect(index.ids().sort()).toEqual(['TASK-1', 'TASK-2']);
  });

  it('gets one task by path', async () => {
    await index.rebuild();
    expect(index.get('Tasks/TASK-1 A.md')?.title).toBe('A');
  });

  it('indexes a file with no id, flagged with a parse error', async () => {
    source.add('Tasks/Loose.md', { title: 'Loose' });
    await index.rebuild();
    const loose = index.get('Tasks/Loose.md');
    expect(loose).toBeDefined();
    expect(loose?.parseErrors.length).toBeGreaterThan(0);
  });

  it('updates a single task without touching the others', async () => {
    await index.rebuild();
    source.add('Tasks/TASK-1 A.md', { id: 'TASK-1', title: 'A renamed', status: 'To Do' });
    await index.updateOne('Tasks/TASK-1 A.md');
    expect(index.get('Tasks/TASK-1 A.md')?.title).toBe('A renamed');
    expect(index.all()).toHaveLength(2);
  });

  it('removes a task', async () => {
    await index.rebuild();
    index.remove('Tasks/TASK-1 A.md');
    expect(index.get('Tasks/TASK-1 A.md')).toBeUndefined();
    expect(index.all()).toHaveLength(1);
  });

  it('ignores updateOne for a path outside the tasks folder', async () => {
    await index.rebuild();
    await index.updateOne('Notes/not-a-task.md');
    expect(index.all()).toHaveLength(2);
  });

  it('notifies subscribers on change and stops after unsubscribe', async () => {
    const cb = vi.fn();
    const off = index.onChange(cb);
    await index.rebuild();
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    await index.rebuild();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('reports duplicate ids', async () => {
    source.add('Tasks/TASK-1 copy.md', { id: 'TASK-1', title: 'A copy' });
    await index.rebuild();
    expect([...index.duplicateIds()]).toEqual(['TASK-1']);
    expect(index.all()).toHaveLength(3);
  });

  it('reports no duplicates when every id is distinct', async () => {
    await index.rebuild();
    expect(index.duplicateIds().size).toBe(0);
  });

  it('loads the body on demand', async () => {
    source.add('Tasks/TASK-3 C.md', { id: 'TASK-3', title: 'C' },
      '---\nid: TASK-3\n---\n\n## Description\n\nFull body.\n');
    await index.rebuild();
    const loaded = await index.loadBody('Tasks/TASK-3 C.md');
    expect(loaded?.description).toBe('Full body.');
    expect(index.get('Tasks/TASK-3 C.md')?.description).toBe('Full body.');
  });

  it('does not blank a loaded body on a subsequent updateOne (C4)', async () => {
    source.add('Tasks/TASK-3 C.md', { id: 'TASK-3', title: 'C' },
      '---\nid: TASK-3\n---\n\n## Description\n\nFull body.\n');
    await index.rebuild();
    await index.loadBody('Tasks/TASK-3 C.md');
    expect(index.get('Tasks/TASK-3 C.md')?.description).toBe('Full body.');

    // Simulate Obsidian's metadataCache 'changed' event firing after the
    // body was already loaded (e.g. "Open as note" edits, or a race with
    // the writer's own re-sync). updateOne must not blank what loadBody
    // already populated.
    await index.updateOne('Tasks/TASK-3 C.md');
    expect(index.get('Tasks/TASK-3 C.md')?.description).toBe('Full body.');
  });

  it('picks up new body content on updateOne after a load (C4)', async () => {
    source.add('Tasks/TASK-3 C.md', { id: 'TASK-3', title: 'C' },
      '---\nid: TASK-3\n---\n\n## Description\n\nFull body.\n');
    await index.rebuild();
    await index.loadBody('Tasks/TASK-3 C.md');

    source.add('Tasks/TASK-3 C.md', { id: 'TASK-3', title: 'C' },
      '---\nid: TASK-3\n---\n\n## Description\n\nEdited body.\n');
    await index.updateOne('Tasks/TASK-3 C.md');
    expect(index.get('Tasks/TASK-3 C.md')?.description).toBe('Edited body.');
  });

  it('updateOne stays frontmatter-only for a task whose body was never loaded (C4)', async () => {
    await index.rebuild();
    const spy = vi.spyOn(source, 'read');
    source.add('Tasks/TASK-1 A.md', { id: 'TASK-1', title: 'A renamed', status: 'To Do' });
    await index.updateOne('Tasks/TASK-1 A.md');
    expect(spy).not.toHaveBeenCalled();
    expect(index.get('Tasks/TASK-1 A.md')?.title).toBe('A renamed');
  });
});

describe('TaskIndex across project folders', () => {
  it('indexes every configured folder, flat, and updates only those', async () => {
    const src = new FakeSource();
    src.add('Tasks/TASK-1 A.md', { id: 'TASK-1', title: 'A' });
    src.add('Alpha/Tasks/ALPHA-1 B.md', { id: 'ALPHA-1', title: 'B' });
    src.add('Beta/Tasks/BETA-1 C.md', { id: 'BETA-1', title: 'C' });
    src.add('Alpha/Notes/other.md', { id: 'X-1', title: 'Not a task' });
    const idx = new TaskIndex(src, () => ['Tasks', 'Alpha/Tasks', 'Beta/Tasks']);
    await idx.rebuild();
    expect(idx.ids().sort()).toEqual(['ALPHA-1', 'BETA-1', 'TASK-1']);

    src.add('Beta/Tasks/BETA-2 D.md', { id: 'BETA-2', title: 'D' });
    await idx.updateOne('Beta/Tasks/BETA-2 D.md');
    src.add('Beta/Tasks/sub/BETA-3 E.md', { id: 'BETA-3', title: 'E' });
    await idx.updateOne('Beta/Tasks/sub/BETA-3 E.md');
    expect(idx.ids()).toContain('BETA-2');
    expect(idx.ids()).not.toContain('BETA-3');
  });
});
