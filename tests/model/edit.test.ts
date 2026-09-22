import { describe, expect, it } from 'vitest';
import { addComment, deleteComment, editComment, setDescription } from '../../src/model/edit';
import { locateSections, parseComments } from '../../src/model/parse';

const FILE = `---
id: TASK-42
title: Fix login redirect
---

## Description

Old description.

## Notes

Hand-written notes that must survive.

## Comments

### Ahmed — 2026-09-21T09:10:00
First comment.

### Sam — 2026-09-22T11:02:00
Second comment.
`;

const commentsOf = (content: string) => {
  const s = locateSections(content);
  return s.commentsStart === -1 ? [] : parseComments(content.slice(s.commentsStart, s.commentsEnd));
};

describe('setDescription', () => {
  it('replaces the description body', () => {
    const out = setDescription(FILE, 'New description.');
    const s = locateSections(out);
    expect(out.slice(s.descriptionStart, s.descriptionEnd).trim()).toBe('New description.');
  });

  it('preserves unrelated sections', () => {
    const out = setDescription(FILE, 'New description.');
    expect(out).toContain('Hand-written notes that must survive.');
    expect(out).toContain('## Notes');
  });

  it('preserves frontmatter byte-for-byte', () => {
    const out = setDescription(FILE, 'New description.');
    expect(out.startsWith('---\nid: TASK-42\ntitle: Fix login redirect\n---\n')).toBe(true);
  });

  it('preserves the comments', () => {
    const out = setDescription(FILE, 'New description.');
    expect(commentsOf(out)).toHaveLength(2);
  });

  it('appends a Description section when absent', () => {
    const bare = '---\nid: T-1\n---\n';
    const out = setDescription(bare, 'Hello.');
    expect(out).toContain('## Description');
    const s = locateSections(out);
    expect(out.slice(s.descriptionStart, s.descriptionEnd).trim()).toBe('Hello.');
  });

  it('is idempotent', () => {
    const once = setDescription(FILE, 'Same.');
    expect(setDescription(once, 'Same.')).toBe(once);
  });
});

describe('addComment', () => {
  it('appends a third comment', () => {
    const out = addComment(FILE, 'Ahmed', '2026-09-23T08:00:00', 'Third comment.');
    const cs = commentsOf(out);
    expect(cs).toHaveLength(3);
    expect(cs[2].body).toBe('Third comment.');
    expect(cs[2].author).toBe('Ahmed');
  });

  it('creates the Comments section when absent', () => {
    const bare = '---\nid: T-1\n---\n\n## Description\n\nBody.\n';
    const out = addComment(bare, 'Ahmed', '2026-09-23T08:00:00', 'Hi.');
    expect(commentsOf(out)).toHaveLength(1);
    expect(out).toContain('Body.');
  });

  it('preserves a multi-line body', () => {
    const out = addComment(FILE, 'Ahmed', '2026-09-23T08:00:00', 'line one\nline two');
    expect(commentsOf(out)[2].body).toBe('line one\nline two');
  });
});

describe('editComment', () => {
  it('replaces one comment body and leaves the others alone', () => {
    const target = commentsOf(FILE)[0].id;
    const out = editComment(FILE, target, 'Edited first.');
    const cs = commentsOf(out);
    expect(cs[0].body).toBe('Edited first.');
    expect(cs[1].body).toBe('Second comment.');
    expect(cs[0].author).toBe('Ahmed');
    expect(cs[0].timestamp).toBe('2026-09-21T09:10:00');
  });

  it('returns the content unchanged for an unknown id', () => {
    expect(editComment(FILE, 'nope#9', 'x')).toBe(FILE);
  });
});

describe('deleteComment', () => {
  it('removes one comment', () => {
    const target = commentsOf(FILE)[0].id;
    const out = deleteComment(FILE, target);
    const cs = commentsOf(out);
    expect(cs).toHaveLength(1);
    expect(cs[0].body).toBe('Second comment.');
  });

  it('preserves other sections', () => {
    const target = commentsOf(FILE)[0].id;
    expect(deleteComment(FILE, target)).toContain('Hand-written notes that must survive.');
  });

  it('returns the content unchanged for an unknown id', () => {
    expect(deleteComment(FILE, 'nope#9')).toBe(FILE);
  });

  it('leaves an empty Comments section when the last comment goes', () => {
    let out = FILE;
    for (const c of commentsOf(FILE)) out = deleteComment(out, commentsOf(out)[0].id);
    expect(commentsOf(out)).toEqual([]);
    expect(out).toContain('## Comments');
  });
});
