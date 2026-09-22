import { beforeEach, describe, expect, it } from 'vitest';
import { TaskWriter, formatTimestamp, sanitizeFilename } from '../../src/write/writer';
import type { VaultAdapter } from '../../src/write/vault';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { locateSections, parseComments } from '../../src/model/parse';

class FakeVault implements VaultAdapter {
  files = new Map<string, string>();
  async read(p: string) {
    const v = this.files.get(p);
    if (v === undefined) throw new Error(`no such file: ${p}`);
    return v;
  }
  async write(p: string, c: string) { this.files.set(p, c); }
  async create(p: string, c: string) {
    if (this.files.has(p)) throw new Error('exists');
    this.files.set(p, c);
  }
  async rename(from: string, to: string) {
    const c = await this.read(from);
    this.files.delete(from);
    this.files.set(to, c);
  }
  async exists(p: string) { return this.files.has(p); }
  async list(folder: string) {
    return [...this.files.keys()].filter((p) => p.startsWith(`${folder}/`));
  }
}

let vault: FakeVault;
let writer: TaskWriter;
const settings = () => ({ ...DEFAULT_SETTINGS, authorName: 'Ahmed' });

beforeEach(() => {
  vault = new FakeVault();
  writer = new TaskWriter(vault, settings);
});

describe('formatTimestamp', () => {
  it('formats to seconds precision without a timezone', () => {
    expect(formatTimestamp(new Date(2026, 8, 21, 9, 5, 3))).toBe('2026-09-21T09:05:03');
  });
});

describe('sanitizeFilename', () => {
  it('strips characters that are illegal in filenames', () => {
    expect(sanitizeFilename('a/b:c*d?e"f<g>h|i')).toBe('abcdefghi');
  });
  it('collapses whitespace and trims', () => {
    expect(sanitizeFilename('  too   many   spaces  ')).toBe('too many spaces');
  });
});

describe('nextId', () => {
  it('starts at 1 for an empty vault', () => {
    expect(writer.nextId([])).toBe('TASK-1');
  });
  it('takes one past the numeric maximum, not the count', () => {
    expect(writer.nextId(['TASK-1', 'TASK-7', 'TASK-3'])).toBe('TASK-8');
  });
  it('ignores ids with a different prefix', () => {
    expect(writer.nextId(['OPS-99', 'TASK-2'])).toBe('TASK-3');
  });
  it('ignores malformed ids', () => {
    expect(writer.nextId(['TASK-abc', 'TASK-4'])).toBe('TASK-5');
  });
});

describe('createTask', () => {
  it('writes a file whose name carries id and title', async () => {
    const path = await writer.createTask('Fix login redirect', { status: 'To Do' }, []);
    expect(path).toBe('Tasks/TASK-1 Fix login redirect.md');
    expect(vault.files.has(path)).toBe(true);
  });

  it('writes frontmatter, description and comments scaffolding', async () => {
    const path = await writer.createTask('Fix login', { status: 'To Do' }, []);
    const content = await vault.read(path);
    expect(content).toContain('id: TASK-1');
    expect(content).toContain('title: Fix login');
    expect(content).toContain('status: To Do');
    expect(content).toContain('## Description');
    expect(content).toContain('## Comments');
  });

  it('stamps created and updated', async () => {
    const path = await writer.createTask('X', {}, []);
    const content = await vault.read(path);
    expect(content).toMatch(/created: \d{4}-\d{2}-\d{2}T/);
    expect(content).toMatch(/updated: \d{4}-\d{2}-\d{2}T/);
  });

  it('serializes array values as YAML lists', async () => {
    const path = await writer.createTask('X', { labels: ['auth', 'ui'] }, []);
    expect(await vault.read(path)).toContain('labels: [auth, ui]');
  });

  it('omits empty values', async () => {
    const path = await writer.createTask('X', { assignee: '', labels: [] }, []);
    const content = await vault.read(path);
    expect(content).not.toContain('assignee:');
    expect(content).not.toContain('labels:');
  });

  it('suffixes the filename on collision rather than overwriting', async () => {
    await vault.write('Tasks/TASK-1 X.md', 'pre-existing');
    const path = await writer.createTask('X', {}, []);
    expect(path).not.toBe('Tasks/TASK-1 X.md');
    expect(await vault.read('Tasks/TASK-1 X.md')).toBe('pre-existing');
  });
});

describe('setField', () => {
  it('updates one frontmatter value and stamps updated', async () => {
    const path = await writer.createTask('X', { status: 'To Do' }, []);
    const before = await vault.read(path);
    await writer.setField(path, 'status', 'Done');
    const after = await vault.read(path);
    expect(after).toContain('status: Done');
    expect(after).not.toContain('status: To Do');
    expect(after).not.toBe(before);
  });

  it('adds a key that was not present', async () => {
    const path = await writer.createTask('X', {}, []);
    await writer.setField(path, 'priority', 'High');
    expect(await vault.read(path)).toContain('priority: High');
  });

  it('removes the key when the value is empty', async () => {
    const path = await writer.createTask('X', { status: 'To Do' }, []);
    await writer.setField(path, 'status', null);
    expect(await vault.read(path)).not.toContain('status:');
  });

  it('leaves the body untouched', async () => {
    const path = await writer.createTask('X', {}, []);
    await writer.setDescriptionAt(path, 'Body text.');
    await writer.setField(path, 'status', 'Done');
    const content = await vault.read(path);
    const s = locateSections(content);
    expect(content.slice(s.descriptionStart, s.descriptionEnd).trim()).toBe('Body text.');
  });
});

describe('setTitle', () => {
  it('renames the file and updates the frontmatter title', async () => {
    const path = await writer.createTask('Old name', {}, []);
    const next = await writer.setTitle(path, 'New name');
    expect(next).toBe('Tasks/TASK-1 New name.md');
    expect(await vault.read(next)).toContain('title: New name');
    expect(vault.files.has(path)).toBe(false);
  });

  it('keeps the old filename when the target already exists', async () => {
    const path = await writer.createTask('Old name', {}, []);
    await vault.write('Tasks/TASK-1 Taken.md', 'other');
    const next = await writer.setTitle(path, 'Taken');
    expect(next).toBe(path);
    expect(await vault.read(path)).toContain('title: Taken');
    expect(await vault.read('Tasks/TASK-1 Taken.md')).toBe('other');
  });
});

describe('comments', () => {
  it('appends a comment authored by the configured name', async () => {
    const path = await writer.createTask('X', {}, []);
    await writer.addCommentAt(path, 'First note.', new Date(2026, 8, 21, 9, 10, 0));
    const content = await vault.read(path);
    const s = locateSections(content);
    const cs = parseComments(content.slice(s.commentsStart, s.commentsEnd));
    expect(cs).toHaveLength(1);
    expect(cs[0].author).toBe('Ahmed');
    expect(cs[0].timestamp).toBe('2026-09-21T09:10:00');
    expect(cs[0].body).toBe('First note.');
  });

  it('edits and deletes by comment id', async () => {
    const path = await writer.createTask('X', {}, []);
    await writer.addCommentAt(path, 'One.', new Date(2026, 8, 21, 9, 10, 0));
    await writer.addCommentAt(path, 'Two.', new Date(2026, 8, 21, 9, 11, 0));

    const read = async () => {
      const c = await vault.read(path);
      const s = locateSections(c);
      return parseComments(c.slice(s.commentsStart, s.commentsEnd));
    };

    await writer.editCommentAt(path, (await read())[0].id, 'One edited.');
    expect((await read())[0].body).toBe('One edited.');

    await writer.deleteCommentAt(path, (await read())[0].id);
    const left = await read();
    expect(left).toHaveLength(1);
    expect(left[0].body).toBe('Two.');
  });
});
