import { beforeEach, describe, expect, it } from 'vitest';
import { TaskWriter, formatTimestamp, sanitizeFilename } from '../../src/write/writer';
import type { VaultAdapter } from '../../src/write/vault';
import { DEFAULT_SETTINGS } from '../../src/settings/defaults';
import { locateSections, parseComments, splitFrontmatter } from '../../src/model/parse';

// --- Minimal YAML-block-aware frontmatter (de)serialization for FakeVault ---
//
// This exists so FakeVault#processFrontmatter can stand in for Obsidian's
// real `app.fileManager.processFrontMatter`, which parses the frontmatter
// into an object, hands it to the mutator, then re-serializes the whole
// block. It intentionally mirrors that round-trip (object in, object out,
// whole block re-emitted) rather than doing line-based string surgery, so
// the tests exercise the same shape of behaviour production code gets from
// Obsidian. It supports the shapes tasks actually use: plain scalars,
// quoted scalars, flow sequences (`[a, b]`) and block sequences
// (`key:\n  - a\n  - b`), which is what Obsidian's own property editor (and
// hand-editing users) produce.

const FM_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}([Tt ]|$)/;
const FM_UNSAFE_START_RE = /^[[\]{}#&*!|>'"%@`]/;

function fmNeedsQuoting(s: string): boolean {
  return (
    s.length === 0 ||
    /^\s/.test(s) ||
    /\s$/.test(s) ||
    FM_UNSAFE_START_RE.test(s) ||
    /: |:$/.test(s) ||
    / #/.test(s) ||
    FM_TIMESTAMP_RE.test(s)
  );
}

function fmScalarOut(v: unknown): string {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  return fmNeedsQuoting(s) ? JSON.stringify(s) : s;
}

function fmValueOut(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(fmScalarOut).join(', ')}]`;
  return fmScalarOut(v);
}

function fmScalarIn(raw: string): unknown {
  const t = raw.trim();
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t);
    } catch {
      return t;
    }
  }
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function fmSplitFlowItems(inner: string): string[] {
  const items: string[] = [];
  let cur = '';
  let quote: string | null = null;
  for (const c of inner) {
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === ',') {
      items.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim() !== '') items.push(cur.trim());
  return items;
}

/** Parse a frontmatter block's inner text (no `---` delimiters) into an object. */
function parseFrontmatterBlock(text: string): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  const lines = text.split('\n');
  let i = 0;
  const isBlockItem = (l: string | undefined): l is string =>
    l !== undefined && /^\s+-\s?/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const m = /^([^\s:][^:]*):\s*(.*)$/.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1].trim();
    const rest = m[2];

    if (rest === '' && isBlockItem(lines[i + 1])) {
      const items: unknown[] = [];
      let j = i + 1;
      while (isBlockItem(lines[j])) {
        items.push(fmScalarIn(lines[j].replace(/^\s+-\s?/, '')));
        j++;
      }
      fm[key] = items;
      i = j;
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      fm[key] = inner === '' ? [] : fmSplitFlowItems(inner).map(fmScalarIn);
      i++;
    } else if (rest === '') {
      fm[key] = null;
      i++;
    } else {
      fm[key] = fmScalarIn(rest);
      i++;
    }
  }
  return fm;
}

function serializeFrontmatterBlock(fm: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fm)) {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
      continue;
    }
    lines.push(`${k}: ${fmValueOut(v)}`);
  }
  return lines.join('\n');
}

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
  async processFrontmatter(p: string, mutate: (fm: Record<string, unknown>) => void) {
    const content = await this.read(p);
    const { frontmatter, bodyStart } = splitFrontmatter(content);
    const hadFrontmatter = bodyStart > 0;
    const fm = parseFrontmatterBlock(frontmatter);
    mutate(fm);
    const serialized = serializeFrontmatterBlock(fm);
    const body = content.slice(bodyStart);
    const next = hadFrontmatter
      ? `---\n${serialized}\n---${body}`
      : `---\n${serialized}\n---\n${body}`;
    this.files.set(p, next);
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

  // Important 3: idPrefix is free-text in settings, and was interpolated
  // into a RegExp unescaped.
  it('does not throw when the prefix contains a regex metacharacter', () => {
    const w = new TaskWriter(vault, () => ({ ...settings(), idPrefix: 'A(B' }));
    expect(() => w.nextId([])).not.toThrow();
    expect(w.nextId(['A(B-3'])).toBe('A(B-4');
  });

  it('does not treat "." in the prefix as a wildcard', () => {
    const w = new TaskWriter(vault, () => ({ ...settings(), idPrefix: 'A.B' }));
    // 'AxB-5' would falsely match if '.' were left as a regex wildcard.
    expect(w.nextId(['AxB-5', 'A.B-2'])).toBe('A.B-3');
  });

  it('honours a project-specific prefix override', () => {
    expect(writer.nextId([], 'PROJ')).toBe('PROJ-1');
    expect(writer.nextId(['PROJ-2', 'TASK-9'], 'PROJ')).toBe('PROJ-3');
  });

  it('falls back to the settings prefix when no override is given', () => {
    expect(writer.nextId(['PROJ-9'])).toBe('TASK-1');
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
    // Quoted: see "quotes created and updated the same way" below for why.
    expect(content).toMatch(/created: "\d{4}-\d{2}-\d{2}T/);
    expect(content).toMatch(/updated: "\d{4}-\d{2}-\d{2}T/);
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

  // Important 2: yamlValue under-escapes realistic input.
  it('quotes a title that would otherwise parse as a YAML flow sequence', async () => {
    const path = await writer.createTask('[URGENT] Fix login', {}, []);
    const content = await vault.read(path);
    expect(content).toContain('title: "[URGENT] Fix login"');
    // Unquoted, this would be a YAML syntax error (`[URGENT] Fix login` is
    // not a well-formed flow sequence), which corrupts the whole file.
    expect(content).not.toContain('title: [URGENT] Fix login');
  });

  it('escapes array items containing YAML-significant characters', async () => {
    const path = await writer.createTask('X', { labels: ['auth', 'needs: review'] }, []);
    const content = await vault.read(path);
    expect(content).toContain('labels: [auth, "needs: review"]');
  });

  it('quotes created and updated the same way', async () => {
    const path = await writer.createTask('X', {}, []);
    const content = await vault.read(path);
    const created = /created: (.+)/.exec(content)?.[1];
    const updated = /updated: (.+)/.exec(content)?.[1];
    expect(created?.startsWith('"')).toBe(true);
    expect(updated?.startsWith('"')).toBe(true);

    // Round-trip through the same frontmatter parser processFrontmatter
    // uses elsewhere in this suite, and confirm both come back as strings
    // (not dates/numbers) -- so created-based sorting keeps comparing
    // strings consistently either way.
    const fm = parseFrontmatterBlock(splitFrontmatter(content).frontmatter);
    expect(typeof fm.created).toBe('string');
    expect(typeof fm.updated).toBe('string');
  });

  it('creates the file under a project prefix when one is given', async () => {
    const path = await writer.createTask('Ship it', {}, [], 'PROJ');
    expect(path).toBe('Tasks/PROJ-1 Ship it.md');
    expect(await vault.read(path)).toContain('id: PROJ-1');
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

describe('frontmatter mutation safety (Critical 1 / Critical 2)', () => {
  it('does not corrupt a block-sequence value when a different field is written', async () => {
    const path = 'Tasks/TASK-1 X.md';
    await vault.write(
      path,
      [
        '---',
        'id: TASK-1',
        'title: X',
        'labels:',
        '  - auth',
        '  - frontend',
        'created: "2026-09-21T09:00:00"',
        'updated: "2026-09-21T09:00:00"',
        '---',
        '',
        '## Description',
        '',
        '',
        '',
        '## Comments',
        '',
      ].join('\n'),
    );

    await writer.setField(path, 'labels', ['auth', 'backend']);
    const content = await vault.read(path);

    // Orphaned continuation lines from the old block sequence would make
    // this invalid YAML; the field must be the new flow sequence and
    // nothing else.
    expect(content).not.toMatch(/^\s+-\s*(auth|frontend)\s*$/m);
    expect(content).toContain('labels: [auth, backend]');
    // id must still be readable -- proof the frontmatter block still parses.
    expect(content).toContain('id: TASK-1');
  });

  it('adds a frontmatter block to a frontmatter-less file without losing any body content', async () => {
    const path = 'Tasks/loose.md';
    const original = '# My loose note\n\nSome text.\n';
    await vault.write(path, original);

    await writer.setField(path, 'id', 'TASK-7');
    const content = await vault.read(path);

    expect(content).toContain(original);
    expect(content).toContain('id: TASK-7');
  });
});

describe('setTitle', () => {
  it('renames the file and updates the frontmatter title', async () => {
    const path = await writer.createTask('Old name', {}, []);
    const { path: next } = await writer.setTitle(path, 'New name');
    expect(next).toBe('Tasks/TASK-1 New name.md');
    expect(await vault.read(next)).toContain('title: New name');
    expect(vault.files.has(path)).toBe(false);
  });

  it('keeps the old filename when the target already exists', async () => {
    const path = await writer.createTask('Old name', {}, []);
    await vault.write('Tasks/TASK-1 Taken.md', 'other');
    const { path: next } = await writer.setTitle(path, 'Taken');
    expect(next).toBe(path);
    expect(await vault.read(path)).toContain('title: Taken');
    expect(await vault.read('Tasks/TASK-1 Taken.md')).toBe('other');
  });

  // Important 5: a filename collision must be signalled to the caller so
  // the UI can show a Notice, per the spec ("the write keeps the old
  // filename and updates only the frontmatter title, WITH A NOTICE").
  it('signals a collision so the caller can notify the user', async () => {
    const path = await writer.createTask('Old name', {}, []);
    await vault.write('Tasks/TASK-1 Taken.md', 'other');
    const result = await writer.setTitle(path, 'Taken');
    expect(result).toEqual({ path, collision: true });
  });

  it('does not signal a collision on an ordinary rename', async () => {
    const path = await writer.createTask('Old name', {}, []);
    const result = await writer.setTitle(path, 'New name');
    expect(result).toEqual({ path: 'Tasks/TASK-1 New name.md', collision: false });
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
