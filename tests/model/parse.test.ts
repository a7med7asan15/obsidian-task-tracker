import { describe, expect, it } from 'vitest';
import { locateSections, parseComments, parseTask, splitFrontmatter } from '../../src/model/parse';

const FILE = `---
id: TASK-42
title: Fix login redirect
status: In Progress
---

## Description

The redirect loops when the session cookie is stale.

Second paragraph.

## Comments

### Ahmed — 2026-09-21T09:10:00
First comment.

### Ahmed — 2026-09-22T11:02:00
Second comment, which
spans two lines.
`;

const FM = { id: 'TASK-42', title: 'Fix login redirect', status: 'In Progress' };

describe('splitFrontmatter', () => {
  it('extracts the frontmatter block and the body offset', () => {
    const r = splitFrontmatter(FILE);
    expect(r.frontmatter).toContain('id: TASK-42');
    expect(FILE.slice(r.bodyStart).startsWith('\n\n## Description')).toBe(true);
  });

  it('handles a file with no frontmatter', () => {
    const r = splitFrontmatter('## Description\n\nhi\n');
    expect(r.frontmatter).toBe('');
    expect(r.bodyStart).toBe(0);
  });
});

describe('locateSections', () => {
  it('finds description and comments ranges', () => {
    const s = locateSections(FILE);
    expect(FILE.slice(s.descriptionStart, s.descriptionEnd).trim())
      .toBe('The redirect loops when the session cookie is stale.\n\nSecond paragraph.');
    expect(FILE.slice(s.commentsStart, s.commentsEnd)).toContain('First comment.');
  });

  it('reports -1 ranges when a section is absent', () => {
    const s = locateSections('---\nid: T-1\n---\n\nJust text.\n');
    expect(s.descriptionStart).toBe(-1);
    expect(s.commentsStart).toBe(-1);
  });

  it('is not confused by a ## heading inside the description', () => {
    const f = '---\nid: T-1\n---\n\n## Description\n\nbody\n\n## Notes\n\nother\n\n## Comments\n\n';
    const s = locateSections(f);
    expect(f.slice(s.descriptionStart, s.descriptionEnd).trim()).toBe('body');
  });
});

describe('parseComments', () => {
  it('parses author, timestamp and multi-line body', () => {
    const s = locateSections(FILE);
    const cs = parseComments(FILE.slice(s.commentsStart, s.commentsEnd));
    expect(cs).toHaveLength(2);
    expect(cs[0].author).toBe('Ahmed');
    expect(cs[0].timestamp).toBe('2026-09-21T09:10:00');
    expect(cs[0].body).toBe('First comment.');
    expect(cs[1].body).toBe('Second comment, which\nspans two lines.');
  });

  it('returns an empty list for an empty section', () => {
    expect(parseComments('')).toEqual([]);
    expect(parseComments('\n\n')).toEqual([]);
  });

  it('gives each comment a distinct id', () => {
    const s = locateSections(FILE);
    const cs = parseComments(FILE.slice(s.commentsStart, s.commentsEnd));
    expect(new Set(cs.map((c) => c.id)).size).toBe(2);
  });
});

describe('parseTask', () => {
  it('builds a task from frontmatter and content', () => {
    const t = parseTask('Tasks/TASK-42 Fix login redirect.md', FM, FILE);
    expect(t.id).toBe('TASK-42');
    expect(t.title).toBe('Fix login redirect');
    expect(t.fields.status).toBe('In Progress');
    expect(t.description).toContain('redirect loops');
    expect(t.comments).toHaveLength(2);
    expect(t.parseErrors).toEqual([]);
  });

  it('falls back to the filename for a missing title', () => {
    const t = parseTask('Tasks/TASK-7 Orphan.md', { id: 'TASK-7' }, '---\nid: TASK-7\n---\n');
    expect(t.title).toBe('TASK-7 Orphan');
  });

  it('records a parse error for a missing id', () => {
    const t = parseTask('Tasks/Loose note.md', {}, '# hi\n');
    expect(t.id).toBeNull();
    expect(t.parseErrors.join(' ')).toMatch(/id/i);
  });

  it('excludes reserved keys from fields', () => {
    const t = parseTask('Tasks/TASK-42 x.md', FM, FILE);
    expect(t.fields).not.toHaveProperty('id');
    expect(t.fields).not.toHaveProperty('title');
  });

  it('yields an empty description when the section is absent', () => {
    const t = parseTask('Tasks/TASK-9 x.md', { id: 'TASK-9', title: 'x' }, '---\nid: TASK-9\n---\n\nloose text\n');
    expect(t.description).toBe('');
  });
});
